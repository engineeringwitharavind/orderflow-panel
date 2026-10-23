import type { Dispatch } from '@reduxjs/toolkit';
import { frameFlushed } from './marketSlice';
import type { BookSnapshot, Trade } from './types';

export type BatchMode = 'frame' | 'immediate';

interface Options {
  /** 'frame': one dispatch per animation frame. 'immediate': one per message (the naive baseline). */
  mode: BatchMode;
  /** Max trades held between flushes. Matches tape capacity: older ones would be evicted anyway. */
  capacity: number;
  schedule?: (flush: () => void) => void;
}

/**
 * Sits between the socket and Redux. The socket can deliver dozens of messages
 * per frame; the screen can only show one frame. So: keep the latest book
 * (each depth20 message replaces the previous), append trades, and dispatch
 * once when the browser is about to paint.
 *
 * requestAnimationFrame does not fire in background tabs, so the buffer is
 * bounded: one book and at most `capacity` trades, however long the tab is hidden.
 */
export class FrameBatcher {
  private symbol: string | null = null;
  private book: BookSnapshot | null = null;
  private trades: Trade[] = [];
  private scheduled = false;
  private readonly schedule: (flush: () => void) => void;

  constructor(
    private readonly dispatch: Dispatch,
    private readonly opts: Options,
  ) {
    this.schedule = opts.schedule ?? ((cb) => requestAnimationFrame(cb));
  }

  pushBook(symbol: string, book: BookSnapshot) {
    this.retarget(symbol);
    this.book = book;
    this.request();
  }

  pushTrade(symbol: string, trade: Trade) {
    this.retarget(symbol);
    this.trades.push(trade);
    // Trim in chunks rather than shifting on every push (shift is O(n)).
    if (this.trades.length >= this.opts.capacity * 2) this.trades = this.trades.slice(-this.opts.capacity);
    this.request();
  }

  /** The book is only meaningful on a live socket; a buffered one must not land after a disconnect. */
  dropBook() {
    this.book = null;
  }

  flush = () => {
    this.scheduled = false;
    if (!this.symbol || (!this.book && this.trades.length === 0)) return;
    const trades = this.trades.length > this.opts.capacity ? this.trades.slice(-this.opts.capacity) : this.trades;
    this.dispatch(frameFlushed({ symbol: this.symbol, book: this.book, trades }));
    this.book = null;
    this.trades = [];
  };

  /** Data for a different symbol replaces whatever is buffered; the old symbol's data is stale. */
  private retarget(symbol: string) {
    if (symbol === this.symbol) return;
    this.symbol = symbol;
    this.book = null;
    this.trades = [];
  }

  private request() {
    if (this.opts.mode === 'immediate') {
      this.flush();
    } else if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(this.flush);
    }
  }
}
