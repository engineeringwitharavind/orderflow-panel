import { describe, expect, it } from 'vitest';
import { setupStore } from '../app/store';
import { parseAggTrade, parseDepth, symbolOf } from '../ws/adapters/binance';
import { statusChanged } from '../ws/connectionSlice';
import { setSymbol } from '../workspace/workspaceSlice';
import { FrameBatcher } from './frameBatcher';
import { TAPE_CAPACITY, frameFlushed } from './marketSlice';
import type { Trade } from './types';

const trade = (id: number, side: Trade['side'] = 'buy'): Trade => ({ id, price: 100, qty: 1, side, ts: id });
const book = { bids: [[101, 2]] as [number, number][], asks: [[102, 3]] as [number, number][], ts: 1 };

describe('binance parsing', () => {
  it('maps m=true (buyer is maker) to a sell aggressor', () => {
    const t = { a: 1, p: '67012.34', q: '0.5', T: 9, m: true };
    expect(parseAggTrade(t, 'BTCUSDT')).toEqual({ id: 1, price: 6701234, qty: 0.5, side: 'sell', ts: 9 });
    expect(parseAggTrade({ ...t, m: false }, 'BTCUSDT')?.side).toBe('buy');
  });

  it('converts prices to integer ticks without float drift', () => {
    const d = parseDepth({ bids: [['0.29', '1']], asks: [['67012.35', '2']] }, 'BTCUSDT', 0);
    expect(d?.bids[0]).toEqual([29, 1]);
    expect(d?.asks[0]).toEqual([6701235, 2]);
  });

  it('drops zero-size levels and rejects malformed payloads', () => {
    expect(parseDepth({ bids: [['1', '0']], asks: [] }, 'BTCUSDT', 0)?.bids).toEqual([]);
    expect(parseDepth({ nope: true }, 'BTCUSDT')).toBeNull();
    expect(parseAggTrade({ a: '1' }, 'BTCUSDT')).toBeNull();
  });

  it('reads the symbol from the stream key', () => {
    expect(symbolOf('ethusdt@depth20@100ms')).toBe('ETHUSDT');
  });
});

describe('market reducer', () => {
  it('applies a frame for the current symbol', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [trade(1), trade(2)] }));
    const { market } = store.getState();
    expect(market.book).toMatchObject({ bestBid: 101, bestAsk: 102, bids: { 101: 2 } });
    expect(market.trades).toMatchObject({ seq: 2, lastId: 2 });
  });

  it('drops a frame for a symbol we switched away from', () => {
    const store = setupStore();
    store.dispatch(setSymbol('ETHUSDT'));
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [trade(1)] }));
    expect(store.getState().market.trades.items).toHaveLength(0);
    expect(store.getState().market.book.bestBid).toBeNull();
  });

  it('resets market data in the same dispatch that changes the symbol', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [trade(1)] }));
    store.dispatch(setSymbol('ETHUSDT'));
    const { market } = store.getState();
    expect(market.symbol).toBe('ETHUSDT');
    expect(market.trades.items).toHaveLength(0);
  });

  it('starts market on the persisted symbol', () => {
    const store = setupStore({ workspace: { ...setupStore().getState().workspace, symbol: 'SOLUSDT' } });
    expect(store.getState().market.symbol).toBe('SOLUSDT');
  });

  it('ignores duplicate trade ids (e.g. after reconnect)', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: [trade(1), trade(2)] }));
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: [trade(2), trade(3)] }));
    expect(store.getState().market.trades.items.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('caps the tape', () => {
    const store = setupStore();
    const many = Array.from({ length: TAPE_CAPACITY + 10 }, (_, i) => trade(i));
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: many }));
    const { items, seq } = store.getState().market.trades;
    expect(items).toHaveLength(TAPE_CAPACITY);
    expect(items[0]!.id).toBe(10);
    expect(seq).toBe(TAPE_CAPACITY + 10);
  });

  it('clears the book when the socket drops, keeps the trades', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [trade(1)] }));
    store.dispatch(statusChanged({ status: 'reconnecting', attempt: 1, retryInMs: 500 }));
    expect(store.getState().market.book.bestBid).toBeNull();
    expect(store.getState().market.trades.items).toHaveLength(1);
  });
});

describe('FrameBatcher', () => {
  function rig(mode: 'frame' | 'immediate' = 'frame', capacity = 100) {
    const store = setupStore();
    let dispatches = 0;
    const frames: Array<() => void> = [];
    const batcher = new FrameBatcher(
      (a) => {
        dispatches++;
        return store.dispatch(a);
      },
      { mode, capacity, schedule: (cb) => frames.push(cb) },
    );
    const runFrame = () => frames.splice(0).forEach((f) => f());
    return { store, batcher, runFrame, count: () => dispatches };
  }

  it('dispatches once per frame however many messages arrive', () => {
    const { store, batcher, runFrame, count } = rig();
    for (let i = 1; i <= 50; i++) batcher.pushTrade('BTCUSDT', trade(i));
    batcher.pushBook('BTCUSDT', { ...book, ts: 1 });
    batcher.pushBook('BTCUSDT', { ...book, bids: [[100, 9]], ts: 2 });
    expect(count()).toBe(0);
    runFrame();
    expect(count()).toBe(1);
    expect(store.getState().market.trades.items).toHaveLength(50);
    expect(store.getState().market.book.bestBid).toBe(100); // latest book wins
  });

  it('immediate mode dispatches per message (the naive baseline)', () => {
    const { batcher, count } = rig('immediate');
    for (let i = 1; i <= 5; i++) batcher.pushTrade('BTCUSDT', trade(i));
    expect(count()).toBe(5);
  });

  it('stays bounded while frames are not running (background tab)', () => {
    const { store, batcher, runFrame } = rig('frame', 100);
    for (let i = 1; i <= 10_000; i++) batcher.pushTrade('BTCUSDT', trade(i));
    expect((batcher as unknown as { trades: Trade[] }).trades.length).toBeLessThan(200);
    runFrame();
    const ids = store.getState().market.trades.items.map((t) => t.id);
    expect(ids).toHaveLength(100);
    expect(ids.at(-1)).toBe(10_000);
  });

  it('a buffered book does not land after a disconnect', () => {
    const { store, batcher, runFrame } = rig();
    batcher.pushBook('BTCUSDT', book);
    batcher.dropBook();
    runFrame();
    expect(store.getState().market.book.bestBid).toBeNull();
  });
});

describe('market reducer purity (no Immer to protect it)', () => {
  it('never mutates the previous state', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book, trades: [trade(1)] }));
    const before = store.getState().market;
    const itemsBefore = before.trades.items;
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: { ...book, bids: [[99, 1]] }, trades: [trade(2)] }));
    expect(itemsBefore).toHaveLength(1);
    expect(before.book.bestBid).toBe(101);
    expect(store.getState().market).not.toBe(before);
  });

  it('returns the same state object when a frame changes nothing', () => {
    const store = setupStore();
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: [trade(1)] }));
    const before = store.getState().market;
    store.dispatch(frameFlushed({ symbol: 'BTCUSDT', book: null, trades: [trade(1)] })); // duplicate only
    expect(store.getState().market).toBe(before);
  });
});
