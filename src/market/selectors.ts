import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../app/store';
import { groupAsk, groupBid } from '../features/ladder/ladderMath';
import type { Ticks } from './types';

export interface GroupedBook {
  bids: Map<Ticks, number>;
  asks: Map<Ticks, number>;
  /** Largest grouped size on either side. Scales the bars. */
  maxSize: number;
}

const selectBook = (s: RootState) => s.market.book;
const selectGrouping = (s: RootState) => s.workspace.layout.ladderGrouping;

/**
 * Computed once per book update, not once per row. Every ladder row reads from
 * this, and since the inputs are the same object for all of them,
 * createSelector's single-entry cache hits for every row after the first.
 */
export const selectGroupedBook = createSelector([selectBook, selectGrouping], (book, g): GroupedBook => {
  const bids = new Map<Ticks, number>();
  const asks = new Map<Ticks, number>();
  for (const key in book.bids) {
    const row = groupBid(Number(key), g);
    bids.set(row, (bids.get(row) ?? 0) + book.bids[key]!);
  }
  for (const key in book.asks) {
    const row = groupAsk(Number(key), g);
    asks.set(row, (asks.get(row) ?? 0) + book.asks[key]!);
  }
  let maxSize = 0;
  for (const v of bids.values()) maxSize = Math.max(maxSize, v);
  for (const v of asks.values()) maxSize = Math.max(maxSize, v);
  return { bids, asks, maxSize };
});

/** The grouped row of the most recent trade, and who aggressed. Buys print at the ask (round up), sells at the bid. */
export const selectLastTrade = (s: RootState): { row: Ticks; side: 'buy' | 'sell' } | null => {
  const items = s.market.trades.items;
  const last = items[items.length - 1];
  if (!last) return null;
  const g = s.workspace.layout.ladderGrouping;
  return { row: last.side === 'buy' ? groupAsk(last.price, g) : groupBid(last.price, g), side: last.side };
};
