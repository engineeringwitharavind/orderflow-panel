import { getSpec } from '../../market/symbols';
import type { BookSnapshot, Level, Trade } from '../../market/types';
import type { Adapter, StreamKey } from './types';

// Market-data-only host first; it is reachable from more regions than the main one.
const URLS = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:9443/stream'];

export const binanceAdapter: Adapter = {
  urls: URLS,
  minControlIntervalMs: 250,
  subscribeFrame: (params, id) => JSON.stringify({ method: 'SUBSCRIBE', params, id }),
  unsubscribeFrame: (params, id) => JSON.stringify({ method: 'UNSUBSCRIBE', params, id }),
  decode(raw) {
    try {
      const msg = JSON.parse(raw) as { stream?: unknown; data?: unknown };
      // Combined-stream envelope: { stream, data }. Replies to SUBSCRIBE look like { result, id }.
      if (typeof msg.stream !== 'string' || msg.data === undefined) return null;
      return { stream: msg.stream, data: msg.data };
    } catch {
      return null;
    }
  },
};

export const depthStream = (symbol: string): StreamKey => `${symbol.toLowerCase()}@depth20@100ms`;
export const tradeStream = (symbol: string): StreamKey => `${symbol.toLowerCase()}@aggTrade`;

/** The symbol comes from the stream name the message arrived on, never from component state. */
export const symbolOf = (stream: StreamKey) => stream.slice(0, stream.indexOf('@')).toUpperCase();

const toTicks = (price: string, tickSize: number) => Math.round(Number(price) / tickSize);

function levels(raw: unknown, tickSize: number): Level[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Level[] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) return null;
    const qty = Number(row[1]);
    if (qty > 0) out.push([toTicks(String(row[0]), tickSize), qty]);
  }
  return out;
}

/** Partial book depth: { lastUpdateId, bids: [[price, qty]], asks: [[price, qty]] }. Each message is the full top 20. */
export function parseDepth(data: unknown, symbol: string, now = Date.now()): BookSnapshot | null {
  const d = data as { bids?: unknown; asks?: unknown };
  const { tickSize } = getSpec(symbol);
  const bids = levels(d?.bids, tickSize);
  const asks = levels(d?.asks, tickSize);
  if (!bids || !asks) return null;
  return { bids, asks, ts: now };
}

/** aggTrade: { a: id, p: price, q: qty, T: trade time, m: buyer is maker }. */
export function parseAggTrade(data: unknown, symbol: string): Trade | null {
  const d = data as { a?: unknown; p?: unknown; q?: unknown; T?: unknown; m?: unknown };
  if (typeof d?.a !== 'number' || typeof d.p !== 'string' || typeof d.q !== 'string') return null;
  return {
    id: d.a,
    price: toTicks(d.p, getSpec(symbol).tickSize),
    qty: Number(d.q),
    // m = true means the buyer was the resting (maker) order, so the aggressor was the seller.
    side: d.m === true ? 'sell' : 'buy',
    ts: typeof d.T === 'number' ? d.T : Date.now(),
  };
}
