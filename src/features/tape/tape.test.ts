import { describe, expect, it } from 'vitest';
import { formatTime, isLargePrint } from './format';
import { tradeAt } from './TapeRow';

describe('tape helpers', () => {
  it('formats time with fixed width, including milliseconds', () => {
    const ts = new Date(2026, 9, 24, 9, 5, 7, 42).getTime();
    expect(formatTime(ts)).toBe('09:05:07.042');
  });

  it('flags prints at or above the large-notional threshold', () => {
    // 2408.97 * 20.76 ≈ 50,010 USDT
    expect(isLargePrint(240897, 20.76, 0.01)).toBe(true);
    expect(isLargePrint(240897, 1, 0.01)).toBe(false);
  });

  it('row 0 is the newest trade', () => {
    const items = [1, 2, 3].map((id) => ({ id, price: 1, qty: 1, side: 'buy' as const, ts: id }));
    expect(tradeAt(items, 0)?.id).toBe(3);
    expect(tradeAt(items, 2)?.id).toBe(1);
    expect(tradeAt(items, 3)).toBeUndefined();
  });
});
