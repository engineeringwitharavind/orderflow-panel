// BASELINE (naive): no memo, no per-row subscription. Sizes arrive as props from a
// parent that re-renders on every book update; bars are sized with width.
import { useEffect, useRef } from 'react';
import type { Ticks } from '../../market/types';
import { COOLDOWN_MS, flash, isSignificant } from './flash';
import styles from './Ladder.module.css';

interface Props {
  price: Ticks;
  priceLabel: string;
  qtyDecimals: number;
  active: boolean;
  bid: number;
  ask: number;
  maxSize: number;
  lastSide: 'buy' | 'sell' | null;
}

export const rowId = (price: Ticks) => `ladder-row-${price}`;

export function LadderRow({ price, priceLabel, qtyDecimals, active, bid, ask, maxSize, lastSide }: Props) {
  const bidFlash = useFlashOnChange(bid, maxSize);
  const askFlash = useFlashOnChange(ask, maxSize);
  const pct = (v: number) => `${maxSize ? (v / maxSize) * 100 : 0}%`;
  return (
    <div role="row" id={rowId(price)} className={styles.row} data-price={price} data-active={active || undefined}>
      <div role="gridcell" className={`${styles.size} ${styles.bid}`}>
        <span className={styles.barNaive} style={{ width: pct(bid) }} aria-hidden />
        <span ref={bidFlash} className={styles.flash} aria-hidden />
        <span className="num">{bid ? bid.toFixed(qtyDecimals) : ''}</span>
      </div>
      <div role="gridcell" className={`${styles.price} num`} data-last={lastSide ?? undefined}>
        {priceLabel}
      </div>
      <div role="gridcell" className={`${styles.size} ${styles.ask}`}>
        <span className={styles.barNaive} style={{ width: pct(ask) }} aria-hidden />
        <span ref={askFlash} className={styles.flash} aria-hidden />
        <span className="num">{ask ? ask.toFixed(qtyDecimals) : ''}</span>
      </div>
    </div>
  );
}

function useFlashOnChange(value: number, maxSize: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const lastFlashAt = useRef(-Infinity);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === value) return;
    const now = performance.now();
    if (now - lastFlashAt.current < COOLDOWN_MS) return;
    if (!isSignificant(before, value, maxSize)) return;
    lastFlashAt.current = now;
    flash(ref.current, value > before ? 'up' : 'down');
  }, [value, maxSize]);
  return ref;
}
