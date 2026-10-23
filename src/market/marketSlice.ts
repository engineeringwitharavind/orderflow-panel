import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
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

const marketSlice = createSlice({
  name: 'market',
  initialState: initialMarket(),
  reducers: {
    // Written as "return a new state" rather than mutating a draft: the data is
    // replaced wholesale every frame, so there is nothing for Immer to diff.
    frameFlushed(state, action: PayloadAction<Frame>): MarketState {
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
      return {
        symbol: state.symbol,
        book: book ? toBook(book) : state.book,
        trades: nextTrades,
      };
    },
  },
  extraReducers: (builder) => {
    // A frozen book looks live. Clear it the moment the socket isn't open; trades stay (they're history).
    builder.addCase(statusChanged, (state, action) => {
      if (action.payload.event.status !== 'open') state.book = emptyBook;
    });
  },
});

export const { frameFlushed } = marketSlice.actions;
export default marketSlice.reducer;
