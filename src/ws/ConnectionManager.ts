import { DEFAULT_BACKOFF, backoffDelay, type BackoffOptions } from './backoff';
import type { Adapter, StreamKey } from './adapters/types';

export type Handler = (data: unknown, stream: StreamKey) => void;

export type StatusEvent =
  | { status: 'idle' | 'connecting' | 'open' | 'offline' }
  | { status: 'reconnecting'; attempt: number; retryInMs: number };

/** The subset of WebSocket the manager uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

export interface ManagerOptions {
  /** Delay before UNSUBSCRIBE once a stream has no handlers. Absorbs StrictMode remounts and quick toggles. */
  idleGraceMs?: number;
  /** No message for this long on an open socket means it is dead even if it still reports open. */
  staleAfterMs?: number;
  /** The retry counter resets only after the socket has stayed open this long, so a flapping server still backs off. */
  stableAfterMs?: number;
  backoff?: BackoffOptions;
  createSocket?: (url: string) => SocketLike;
  random?: () => number;
  /** Window-like target for online/visibility events. null disables them (tests, workers). */
  env?: Pick<Window, 'addEventListener' | 'removeEventListener'> & {
    navigator?: { onLine: boolean };
    document?: { visibilityState: string };
  } | null;
}

interface Entry {
  handlers: Set<Handler>;
  /** True once SUBSCRIBE for this stream has been sent on the current socket. */
  subscribed: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const OPEN = 1;

/**
 * One WebSocket shared by every stream.
 *
 * - Streams are ref-counted: the first handler subscribes, the last one leaving
 *   unsubscribes after a grace period.
 * - The socket opens lazily on the first subscription and closes when nothing is subscribed.
 * - Unexpected closes reconnect with jittered exponential backoff, rotating through
 *   the adapter's URLs, and resubscribe everything that is still wanted.
 * - A watchdog replaces a socket that has gone silent.
 * - SUBSCRIBE/UNSUBSCRIBE changes are coalesced and throttled to respect the exchange's limit.
 */
export class ConnectionManager {
  private readonly entries = new Map<StreamKey, Entry>();
  private readonly statusListeners = new Set<(e: StatusEvent) => void>();
  /** Streams that were subscribed on the server and are no longer wanted. */
  private readonly pendingUnsubscribe = new Set<StreamKey>();
  private socket: SocketLike | null = null;
  private status: StatusEvent = { status: 'idle' };
  private attempt = 0;
  private nextId = 1;
  private lastMessageAt = 0;
  private lastControlAt = -Infinity;

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private controlTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly opts: Required<Omit<ManagerOptions, 'env'>> & { env: ManagerOptions['env'] };

  constructor(
    private readonly adapter: Adapter,
    options: ManagerOptions = {},
  ) {
    this.opts = {
      idleGraceMs: 250,
      staleAfterMs: 10_000,
      stableAfterMs: 10_000,
      backoff: DEFAULT_BACKOFF,
      createSocket: (url) => new WebSocket(url),
      random: Math.random,
      env: typeof window === 'undefined' ? null : window,
      ...options,
    };
    this.opts.env?.addEventListener('online', this.retryNow);
    this.opts.env?.addEventListener('visibilitychange', this.retryNow);
  }

  // ---- public API --------------------------------------------------------

  subscribe(stream: StreamKey, handler: Handler): () => void {
    let entry = this.entries.get(stream);
    if (!entry) {
      entry = { handlers: new Set(), subscribed: false, idleTimer: null };
      this.entries.set(stream, entry);
    }
    entry.handlers.add(handler);
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }

    if (this.socket) this.scheduleControl();
    else if (!this.retryTimer && this.status.status !== 'offline') this.connect();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.release(stream, handler);
    };
  }

  onStatus(listener: (e: StatusEvent) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): StatusEvent {
    return this.status;
  }

  dispose() {
    this.opts.env?.removeEventListener('online', this.retryNow);
    this.opts.env?.removeEventListener('visibilitychange', this.retryNow);
    for (const entry of this.entries.values()) if (entry.idleTimer) clearTimeout(entry.idleTimer);
    this.entries.clear();
    this.closeSocket();
    this.statusListeners.clear();
  }

  // ---- subscriptions -----------------------------------------------------

  private release(stream: StreamKey, handler: Handler) {
    const entry = this.entries.get(stream);
    if (!entry) return;
    // Removing the handler is immediate: a late message for this stream is dropped from now on.
    entry.handlers.delete(handler);
    if (entry.handlers.size > 0 || entry.idleTimer) return;
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null;
      if (entry.handlers.size > 0) return;
      this.entries.delete(stream);
      if (this.entries.size === 0) {
        this.closeSocket();
      } else if (entry.subscribed) {
        this.pendingUnsubscribe.add(stream);
        this.scheduleControl();
      }
    }, this.opts.idleGraceMs);
  }

  /** Coalesce subscription changes into at most one SUBSCRIBE and one UNSUBSCRIBE per control interval. */
  private scheduleControl() {
    if (this.controlTimer || !this.socket || this.socket.readyState !== OPEN) return;
    const wait = Math.max(0, this.lastControlAt + this.adapter.minControlIntervalMs - Date.now());
    this.controlTimer = setTimeout(() => {
      this.controlTimer = null;
      this.flushControl();
    }, wait);
  }

  private flushControl() {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return;

    const toSubscribe: StreamKey[] = [];
    for (const [stream, entry] of this.entries) {
      if (!entry.subscribed && entry.handlers.size > 0) {
        entry.subscribed = true;
        toSubscribe.push(stream);
      }
    }
    const toUnsubscribe = [...this.pendingUnsubscribe].filter((s) => !this.entries.has(s));
    this.pendingUnsubscribe.clear();

    // Binance counts every frame against its limit, so send at most one of each, spaced out.
    const frames: string[] = [];
    if (toUnsubscribe.length) frames.push(this.adapter.unsubscribeFrame(toUnsubscribe, this.nextId++));
    if (toSubscribe.length) frames.push(this.adapter.subscribeFrame(toSubscribe, this.nextId++));
    if (frames.length === 0) return;

    socket.send(frames[0]!);
    this.lastControlAt = Date.now();
    if (frames[1]) {
      const second = frames[1];
      this.controlTimer = setTimeout(() => {
        this.controlTimer = null;
        if (this.socket === socket && socket.readyState === OPEN) {
          socket.send(second);
          this.lastControlAt = Date.now();
        }
      }, this.adapter.minControlIntervalMs);
    }
  }

  // ---- socket lifecycle --------------------------------------------------

  private connect() {
    this.clearRetry();
    const url = this.adapter.urls[this.attempt % this.adapter.urls.length]!;
    this.setStatus({ status: 'connecting' });
    const socket = this.opts.createSocket(url);
    this.socket = socket;
    // The watchdog starts now, not on open, so a handshake that hangs is also replaced.
    this.lastMessageAt = Date.now();
    this.watchdog = setInterval(this.checkStale, Math.max(1000, this.opts.staleAfterMs / 4));

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.setStatus({ status: 'open' });
      this.lastMessageAt = Date.now();
      this.lastControlAt = -Infinity;
      this.flushControl();
      this.stableTimer = setTimeout(() => (this.attempt = 0), this.opts.stableAfterMs);
    };

    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      this.lastMessageAt = Date.now();
      const decoded = this.adapter.decode(String(ev.data));
      if (!decoded) return;
      const entry = this.entries.get(decoded.stream);
      if (!entry) return;
      for (const handler of entry.handlers) handler(decoded.data, decoded.stream);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.handleDrop();
    };

    // An error is always followed by close; reconnect logic lives there.
    socket.onerror = null;
  }

  private readonly checkStale = () => {
    if (Date.now() - this.lastMessageAt > this.opts.staleAfterMs) this.handleDrop();
  };

  /** Socket died (closed, errored, or went silent). Throw it away and schedule a retry. */
  private handleDrop() {
    this.detachSocket();
    if (this.entries.size === 0) {
      this.setStatus({ status: 'idle' });
      return;
    }
    if (this.opts.env?.navigator?.onLine === false) {
      // Retrying while offline only burns attempts. The 'online' event resumes.
      this.setStatus({ status: 'offline' });
      return;
    }
    this.attempt += 1;
    const retryInMs = backoffDelay(this.attempt, this.opts.backoff, this.opts.random);
    this.setStatus({ status: 'reconnecting', attempt: this.attempt, retryInMs });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, retryInMs);
  }

  /** Coming back online or to a visible tab: don't wait out a long backoff. */
  private readonly retryNow = () => {
    if (this.entries.size === 0 || this.socket) return;
    if (this.opts.env?.document && this.opts.env.document.visibilityState !== 'visible') return;
    if (this.retryTimer || this.status.status === 'offline') this.connect();
  };

  private detachSocket() {
    const socket = this.socket;
    this.socket = null;
    if (this.stableTimer) clearTimeout(this.stableTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.controlTimer) clearTimeout(this.controlTimer);
    this.stableTimer = this.watchdog = this.controlTimer = null;
    this.pendingUnsubscribe.clear();
    for (const entry of this.entries.values()) entry.subscribed = false;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close();
      } catch {
        // already closed
      }
    }
  }

  /** Intentional close: nothing is subscribed. No reconnect. */
  private closeSocket() {
    this.clearRetry();
    this.detachSocket();
    this.attempt = 0;
    this.setStatus({ status: 'idle' });
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private setStatus(next: StatusEvent) {
    this.status = next;
    for (const listener of this.statusListeners) listener(next);
  }
}
