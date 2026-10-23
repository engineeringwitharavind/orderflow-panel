import type { Ticks } from '../../market/types';

// Bids round down and asks round up into their group. Since bid < ask always,
// floor(bid) < ceil(ask): a grouped row never holds both sides.
export const groupBid = (price: Ticks, g: number) => Math.floor(price / g) * g;
export const groupAsk = (price: Ticks, g: number) => Math.ceil(price / g) * g;

/** Row prices for a window of `rows` rows centred on `anchor`, highest first (asks on top, like every DOM). */
export function windowPrices(anchor: Ticks, rows: number, g: number): Ticks[] {
  const half = Math.floor(rows / 2);
  return Array.from({ length: rows }, (_, i) => anchor + (half - i) * g);
}

/** The anchor that puts the inside market in the middle of the window. */
export function centreOf(bestBid: Ticks, bestAsk: Ticks, g: number): Ticks {
  return groupBid(Math.floor((bestBid + bestAsk) / 2), g);
}

/**
 * True when the inside market is within `margin` rows of an edge or outside the
 * window. Recentring only then (not on every tick) is what traders expect from a
 * DOM, and it keeps the price column still so most rows don't re-render.
 */
export function needsRecentre(
  anchor: Ticks,
  rows: number,
  g: number,
  bestBid: Ticks,
  bestAsk: Ticks,
  margin = 2,
): boolean {
  const half = Math.floor(rows / 2);
  const top = anchor + (half - margin) * g;
  const bottom = anchor - (rows - 1 - half - margin) * g;
  return groupAsk(bestAsk, g) > top || groupBid(bestBid, g) < bottom;
}

/** Shift the anchor just enough to keep `price` inside the window (keyboard navigation past the edge). */
export function anchorToShow(anchor: Ticks, rows: number, g: number, price: Ticks): Ticks {
  const half = Math.floor(rows / 2);
  const top = anchor + half * g;
  const bottom = anchor - (rows - 1 - half) * g;
  if (price > top) return anchor + (price - top);
  if (price < bottom) return anchor - (bottom - price);
  return anchor;
}
