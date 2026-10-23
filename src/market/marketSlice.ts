import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import { statusChanged } from '../ws/connectionSlice';
import { DEFAULT_SYMBOL } from './symbols';
import type { BookSnapshot, Ticks, Trade } from './types';

export const TAPE_CAPACITY = 5000;

export interface Book {
  bids: Record<Ticks, number>;
  asks: Record<Ticks, number>;
  bestBid: Ticks | null;
  bestAsk: Ticks | null;
  ts: number;
}

export interface MarketState {
  /** The symbol this data belongs to. Kept equal to workspace.symbol by the root reducer. */
  symbol: string;
  book: Book;
  trades: {
    /** Oldest first, at most TAPE_CAPACITY. */
    items: Trade[];
    /** Total trades ever appended. Stable row identity while old ones are evicted. */
    seq: number;
    /** Highest trade id applied; anything at or below it is a duplicate (e.g. replayed after reconnect). */
    lastId: number;
  };
}

export interface Frame {
  symbol: string;
  book: BookSnapshot | null;
  trades: Trade[];
}

const emptyBook: Book = { bids: {}, asks: {}, bestBid: null, bestAsk: null, ts: 0 };

export const initialMarket = (symbol: string = DEFAULT_SYMBOL): MarketState => ({
  symbol,
  book: emptyBook,
  trades: { items: [], seq: 0, lastId: -1 },
});

function toBook(snapshot: BookSnapshot): Book {
  const bids: Record<Ticks, number> = {};
  const asks: Record<Ticks, number> = {};
  for (const [price, qty] of snapshot.bids) bids[price] = qty;
  for (const [price, qty] of snapshot.asks) asks[price] = qty;
  return {
    bids,
    asks,
    bestBid: snapshot.bids[0]?.[0] ?? null,
    bestAsk: snapshot.asks[0]?.[0] ?? null,
    ts: snapshot.ts,
  };
}

export const frameFlushed = createAction<Frame>('market/frameFlushed');

/**
 * A plain reducer, deliberately not createSlice. RTK wraps slice reducers in
 * Immer, so `state` would be a proxy: `state.trades.items.concat(...)` reads
 * every one of the 5,000 trades through it, creating a child draft per trade,
 * and Immer then walks them all again to finalise. Profiling showed that as the
 * single largest cost at 10x. This slice is replaced wholesale every frame, so
 * Immer buys nothing here; the other slices keep it.
 */
export default function marketReducer(state: MarketState = initialMarket(), action: UnknownAction): MarketState {
  if (frameFlushed.match(action)) {
    const { symbol, book, trades } = action.payload;
    // A frame for a symbol we've switched away from is dropped, not merged.
    if (symbol !== state.symbol) return state;

    let nextTrades = state.trades;
    const fresh = trades.filter((t) => t.id > state.trades.lastId);
    if (fresh.length) {
      const merged = state.trades.items.concat(fresh);
      nextTrades = {
        items: merged.length > TAPE_CAPACITY ? merged.slice(merged.length - TAPE_CAPACITY) : merged,
        seq: state.trades.seq + fresh.length,
        lastId: fresh[fresh.length - 1]!.id,
      };
    }
    if (!book && nextTrades === state.trades) return state;
    return { symbol: state.symbol, book: book ? toBook(book) : state.book, trades: nextTrades };
  }
  // A frozen book looks live. Clear it the moment the socket isn't open; trades stay (they're history).
  if (statusChanged.match(action) && action.payload.event.status !== 'open' && state.book !== emptyBook) {
    return { ...state, book: emptyBook };
  }
  return state;
}
