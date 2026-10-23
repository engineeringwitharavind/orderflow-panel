/** Prices are integer ticks (price / tickSize) everywhere inside the app. Convert only for display. */
export type Ticks = number;

/** [price in ticks, size] */
export type Level = readonly [Ticks, number];

export interface BookSnapshot {
  /** Best first: bids descending, asks ascending. */
  bids: Level[];
  asks: Level[];
  ts: number;
}

export interface Trade {
  id: number;
  price: Ticks;
  qty: number;
  /** Aggressor side: 'buy' lifted the offer, 'sell' hit the bid. */
  side: 'buy' | 'sell';
  ts: number;
}
