import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay } from './backoff';
import { ConnectionManager, type SocketLike, type StatusEvent } from './ConnectionManager';
import type { Adapter } from './adapters/types';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Array<{ method: string; params: string[] }> = [];
  closed = false;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  constructor(public url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  emit(stream: string, data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ stream, data }) }));
  }
  drop() {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }
}

const adapter: Adapter = {
  urls: ['wss://a', 'wss://b'],
  minControlIntervalMs: 250,
  subscribeFrame: (params, id) => JSON.stringify({ method: 'SUBSCRIBE', params, id }),
  unsubscribeFrame: (params, id) => JSON.stringify({ method: 'UNSUBSCRIBE', params, id }),
  decode: (raw) => {
    const m = JSON.parse(raw);
    return typeof m.stream === 'string' ? { stream: m.stream, data: m.data } : null;
  },
};

function setup(overrides = {}) {
  const sockets: FakeSocket[] = [];
  const statuses: StatusEvent[] = [];
  const manager = new ConnectionManager(adapter, {
    env: null,
    random: () => 0.5,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    ...overrides,
  });
  manager.onStatus((e) => statuses.push(e));
  const last = () => sockets[sockets.length - 1]!;
  return { manager, sockets, statuses, last };
}

const methods = (s: FakeSocket) => s.sent.map((f) => `${f.method} ${f.params.join(',')}`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ConnectionManager', () => {
  it('connects lazily and subscribes on open', () => {
    const { manager, sockets, last } = setup();
    expect(sockets).toHaveLength(0);
    manager.subscribe('btc@trade', () => {});
    expect(sockets).toHaveLength(1);
    last().open();
    expect(methods(last())).toEqual(['SUBSCRIBE btc@trade']);
  });

  it('ref-counts: one SUBSCRIBE per stream, UNSUBSCRIBE only after the last handler and the grace period', () => {
    const { manager, last } = setup();
    const offA = manager.subscribe('btc@trade', () => {});
    manager.subscribe('eth@trade', () => {});
    last().open();
    const offB = manager.subscribe('btc@trade', () => {});
    vi.advanceTimersByTime(300);
    expect(methods(last())).toEqual(['SUBSCRIBE btc@trade,eth@trade']);

    offA();
    vi.advanceTimersByTime(1000);
    expect(methods(last())).toHaveLength(1);

    offB();
    vi.advanceTimersByTime(249);
    expect(methods(last())).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(methods(last())).toEqual(['SUBSCRIBE btc@trade,eth@trade', 'UNSUBSCRIBE btc@trade']);
  });

  it('a remount inside the grace period (StrictMode) sends nothing', () => {
    const { manager, last } = setup();
    manager.subscribe('eth@trade', () => {});
    const off = manager.subscribe('btc@trade', () => {});
    last().open();
    off();
    manager.subscribe('btc@trade', () => {});
    vi.advanceTimersByTime(2000);
    expect(methods(last())).toEqual(['SUBSCRIBE eth@trade,btc@trade']);
  });

  it('routes by stream and drops messages for streams with no handlers', () => {
    const { manager, last } = setup();
    const got: string[] = [];
    const off = manager.subscribe('btc@trade', (d, stream) => got.push(`${stream}:${d}`));
    manager.subscribe('eth@trade', () => {});
    last().open();
    last().emit('btc@trade', 1);
    last().emit('sol@trade', 2);
    off();
    last().emit('btc@trade', 3); // in flight after unsubscribe: dropped immediately, not after the grace period
    expect(got).toEqual(['btc@trade:1']);
  });

  it('closes the socket when the last stream goes idle, without reconnecting', () => {
    const { manager, sockets, last } = setup();
    const off = manager.subscribe('btc@trade', () => {});
    last().open();
    off();
    vi.advanceTimersByTime(300);
    expect(last().closed).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(manager.getStatus().status).toBe('idle');
  });

  it('reconnects with backoff, rotates URLs, and resubscribes everything', () => {
    const { manager, sockets, statuses, last } = setup();
    manager.subscribe('btc@trade', () => {});
    manager.subscribe('btc@depth', () => {});
    last().open();
    last().drop();

    expect(statuses.at(-1)).toEqual({ status: 'reconnecting', attempt: 1, retryInMs: 250 });
    vi.advanceTimersByTime(249);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    expect(last().url).toBe('wss://b');

    last().open();
    expect(methods(last())).toEqual(['SUBSCRIBE btc@trade,btc@depth']);
  });

  it('keeps backing off while the server flaps; resets only after a stable connection', () => {
    const { manager, statuses, last } = setup();
    manager.subscribe('btc@trade', () => {});
    for (let i = 1; i <= 3; i++) {
      last().open();
      last().drop(); // opened then died immediately
      const s = statuses.at(-1) as Extract<StatusEvent, { status: 'reconnecting' }>;
      expect(s.attempt).toBe(i);
      vi.advanceTimersByTime(s.retryInMs);
    }
    last().open();
    vi.advanceTimersByTime(10_000); // stable
    last().drop();
    expect(statuses.at(-1)).toMatchObject({ status: 'reconnecting', attempt: 1 });
  });

  it('replaces a socket that goes silent (watchdog)', () => {
    const { manager, sockets, last } = setup({ staleAfterMs: 5000 });
    manager.subscribe('btc@trade', () => {});
    last().open();
    vi.advanceTimersByTime(4000);
    last().emit('btc@trade', 1);
    vi.advanceTimersByTime(4000);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(sockets[0]!.closed).toBe(true);
    expect(sockets).toHaveLength(2); // already retried (250 ms backoff)
  });

  it('times out a handshake that never opens', () => {
    const { manager, sockets } = setup({ staleAfterMs: 5000 });
    manager.subscribe('btc@trade', () => {});
    vi.advanceTimersByTime(4000);
    expect(sockets).toHaveLength(1);
    // The watchdog checks every staleAfterMs / 4, so detection lands within 5–6.25 s.
    vi.advanceTimersByTime(2250);
    expect(sockets[0]!.closed).toBe(true);
    expect(manager.getStatus().status).toBe('reconnecting');
  });

  it('ignores events from a socket it has already replaced', () => {
    const { manager, sockets, last } = setup();
    const got: unknown[] = [];
    // (got stays empty: nothing was emitted on the live socket)
    manager.subscribe('btc@trade', (d) => got.push(d));
    const first = last();
    first.open();
    first.drop();
    vi.advanceTimersByTime(1000);
    // the old socket's handlers were detached; even a stray call can't reach the manager
    expect(first.onmessage).toBeNull();
    expect(sockets).toHaveLength(2);
  });

  it('throttles control frames to the exchange limit', () => {
    const { manager, last } = setup();
    manager.subscribe('a@t', () => {});
    last().open();
    const offB = manager.subscribe('b@t', () => {});
    vi.advanceTimersByTime(0);
    expect(methods(last())).toEqual(['SUBSCRIBE a@t']); // too soon after the open-time frame
    vi.advanceTimersByTime(250);
    expect(methods(last())).toEqual(['SUBSCRIBE a@t', 'SUBSCRIBE b@t']);
    offB();
    manager.subscribe('c@t', () => {});
    vi.advanceTimersByTime(600);
    const sent = methods(last());
    expect(sent.slice(2)).toEqual(['UNSUBSCRIBE b@t', 'SUBSCRIBE c@t']);
  });
});

describe('backoffDelay', () => {
  it('doubles the ceiling per attempt and caps it', () => {
    const max = () => 0.999999;
    expect(backoffDelay(1, { baseMs: 500, capMs: 30_000 }, max)).toBe(499);
    expect(backoffDelay(3, { baseMs: 500, capMs: 30_000 }, max)).toBe(1999);
    expect(backoffDelay(20, { baseMs: 500, capMs: 30_000 }, max)).toBe(29_999);
    expect(backoffDelay(5, { baseMs: 500, capMs: 30_000 }, () => 0)).toBe(0);
  });
});
