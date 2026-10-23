import { describe, expect, it } from 'vitest';
import { setupStore } from '../../app/store';
import { frameFlushed } from '../../market/marketSlice';
import { selectGroupedBook, selectLastTrade } from '../../market/selectors';
import { setGrouping } from '../../workspace/workspaceSlice';
import { anchorToShow, barScale, centreOf, groupAsk, groupBid, needsRecentre, windowPrices } from './ladderMath';

describe('ladder maths', () => {
  it('groups bids down and asks up, so one row never holds both sides', () => {
    expect(groupBid(240897, 100)).toBe(240800);
    expect(groupAsk(240898, 100)).toBe(240900);
    expect(groupBid(240900, 100)).toBe(240900);
    expect(groupAsk(240901, 100)).toBe(241000);
    for (let bid = 240890; bid < 240910; bid++) {
      expect(groupBid(bid, 100)).toBeLessThan(groupAsk(bid + 1, 100));
    }
  });

  it('lays out rows highest first around the anchor', () => {
    expect(windowPrices(100, 5, 1)).toEqual([102, 101, 100, 99, 98]);
    expect(windowPrices(1000, 4, 10)).toEqual([1020, 1010, 1000, 990]);
  });

  it('centres on the mid, snapped to the grouping', () => {
    expect(centreOf(240897, 240898, 1)).toBe(240897);
    expect(centreOf(240897, 240898, 100)).toBe(240800);
  });

  it('asks for a recentre only near or past the edge', () => {
    // 11 rows around 100: 105..95. Margin 2 → inside market must stay within 103..97.
    expect(needsRecentre(100, 11, 1, 100, 101)).toBe(false);
    expect(needsRecentre(100, 11, 1, 102, 103)).toBe(false);
    expect(needsRecentre(100, 11, 1, 103, 104)).toBe(true);
    expect(needsRecentre(100, 11, 1, 96, 97)).toBe(true);
  });

  it('shifts the anchor just enough to show a row', () => {
    expect(anchorToShow(100, 11, 1, 103)).toBe(100);
    expect(anchorToShow(100, 11, 1, 107)).toBe(102);
    expect(anchorToShow(100, 11, 1, 90)).toBe(95);
  });
});

describe('grouped book selector', () => {
  const book = {
    bids: [[240897, 1], [240850, 2], [240799, 4]] as [number, number][],
    asks: [[240898, 1.5], [240950, 0.5], [241001, 3]] as [number, number][],
    ts: 1,
  };

  it('sums levels into grouped rows and tracks the largest', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [] }));
    store.dispatch(setGrouping(100));
    const g = selectGroupedBook(store.getState());
    // Maps are only used for lookups, so compare contents, not insertion order.
    expect(Object.fromEntries(g.bids)).toEqual({ 240800: 3, 240700: 4 });
    expect(Object.fromEntries(g.asks)).toEqual({ 240900: 1.5, 241000: 0.5, 241100: 3 });
    expect(g.maxSize).toBe(4);
  });

  it('is computed once per state, however many rows read it', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [] }));
    const s = store.getState();
    expect(selectGroupedBook(s)).toBe(selectGroupedBook(s));
  });

  it('puts the last trade on the ask row for buys, the bid row for sells', () => {
    const store = setupStore();
    store.dispatch(setGrouping(100));
    const t = { price: 240850, qty: 1, ts: 1 };
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: [{ ...t, id: 1, side: 'buy' }] }));
    expect(selectLastTrade(store.getState())).toEqual({ row: 240900, side: 'buy' });
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: [{ ...t, id: 2, side: 'sell' }] }));
    expect(selectLastTrade(store.getState())).toEqual({ row: 240800, side: 'sell' });
  });
});

describe('flash significance', () => {
  it('ignores routine changes, flags large orders arriving or leaving', async () => {
    const { isSignificant } = await import('./flash');
    expect(isSignificant(1.0, 1.2, 40)).toBe(false); // 0.2 of 40: routine
    expect(isSignificant(1.0, 12, 40)).toBe(true); // +11 ≥ 10: stacking
    expect(isSignificant(15, 0, 40)).toBe(true); // -15: pulled
    expect(isSignificant(0, 5, 0)).toBe(false); // empty book: never
  });
});

describe('bar scale steps', () => {
  it('rounds up to steps ~26% apart, so small changes in the largest size do not rewrite --max', () => {
    expect(barScale(18.3)).toBe(19.9526);
    expect(barScale(18.9)).toBe(19.9526); // same step: no write, no restyle
    expect(barScale(20)).toBe(25.1189); // just past a step: next one up
    expect(barScale(0)).toBe(1);
  });

  it('keeps the largest bar at 79% or more of its column', () => {
    for (const v of [0.003, 0.7, 1, 4.2, 18.3, 99.9, 1234]) {
      const fill = v / barScale(v);
      expect(fill).toBeGreaterThan(0.79);
      expect(fill).toBeLessThanOrEqual(1);
    }
  });
});
