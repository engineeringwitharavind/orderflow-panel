import type { SocketLike } from '../ConnectionManager';

interface Capture {
  symbol: string;
  seconds: number;
  streams: string[];
  /** [ms since recording started, raw frame] */
  messages: [number, string][];
}

interface Frame {
  t: number;
  stream: string;
  raw: string;
  /** Parsed only for trades, which need new ids on each loop. */
  trade: Record<string, unknown> | null;
}

const cache = new Map<string, Promise<{ frames: Frame[]; durationMs: number; maxTradeId: number }>>();

function load(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`capture ${url}: HTTP ${r.status}`);
        return r.json() as Promise<Capture>;
      })
      .then((capture) => {
        let maxTradeId = 0;
        const frames = capture.messages.map(([t, raw]): Frame => {
          const msg = JSON.parse(raw) as { stream: string; data: Record<string, unknown> };
          const isTrade = msg.stream.endsWith('@aggTrade');
          if (isTrade) maxTradeId = Math.max(maxTradeId, Number(msg.data.a));
          return { t, stream: msg.stream, raw, trade: isTrade ? msg.data : null };
        });
        return { frames, durationMs: capture.seconds * 1000, maxTradeId };
      });
    cache.set(url, p);
  }
  return p;
}

/**
 * Plays a recorded capture through the real ConnectionManager, as if it were
 * Binance: same frames, same timing (optionally sped up), same SUBSCRIBE
 * protocol. Only streams the app subscribed to are sent. At the end it loops,
 * giving trades fresh ids so the dedupe in the reducer doesn't drop them.
 *
 * Performance runs use this so "before" and "after" see the identical minute
 * of market data.
 */
export class ReplaySocket implements SocketLike {
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;

  private readonly subscribed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(captureUrl: string, private readonly speed = 1) {
    load(captureUrl).then(
      (data) => {
        if (this.readyState !== 0) return; // closed before the capture loaded
        this.readyState = 1;
        this.onopen?.(new Event('open'));
        this.play(data);
      },
      (err) => {
        console.error(err);
        this.close();
        this.onclose?.(new CloseEvent('close'));
      },
    );
  }

  send(data: string) {
    const msg = JSON.parse(data) as { method: string; params: string[]; id: number };
    for (const s of msg.params) {
      if (msg.method === 'SUBSCRIBE') this.subscribed.add(s);
      else if (msg.method === 'UNSUBSCRIBE') this.subscribed.delete(s);
    }
    queueMicrotask(() => this.emit(JSON.stringify({ result: null, id: msg.id })));
  }

  close() {
    this.readyState = 3;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(raw: string) {
    if (this.readyState === 1) this.onmessage?.(new MessageEvent('message', { data: raw }));
  }

  private play({ frames, durationMs, maxTradeId }: Awaited<ReturnType<typeof load>>) {
    let i = 0;
    let loop = 0;
    let loopStart = performance.now();

    const tick = () => {
      if (this.readyState !== 1) return;
      const elapsed = (performance.now() - loopStart) * this.speed;
      // Emit everything that is due; at high speeds several frames fall in one tick.
      while (i < frames.length && frames[i]!.t <= elapsed) {
        const f = frames[i++]!;
        if (!this.subscribed.has(f.stream)) continue;
        if (loop === 0 || !f.trade) this.emit(f.raw);
        else {
          const data = { ...f.trade, a: Number(f.trade.a) + loop * (maxTradeId + 1), T: Date.now() };
          this.emit(JSON.stringify({ stream: f.stream, data }));
        }
      }
      if (i >= frames.length) {
        i = 0;
        loop += 1;
        loopStart += durationMs / this.speed;
      }
      const next = frames[i];
      const wait = next ? Math.max(0, next.t / this.speed - (performance.now() - loopStart)) : 0;
      this.timer = setTimeout(tick, wait);
    };
    tick();
  }
}
