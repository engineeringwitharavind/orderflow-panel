import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { useStore } from 'react-redux';
import { useAppSelector } from '../../app/hooks';
import type { RootState } from '../../app/store';
import { selectGroupedBook, selectLastTrade } from '../../market/selectors';
import type { Ticks } from '../../market/types';
import { COOLDOWN_MS, flash, isSignificant } from './flash';
import styles from './Ladder.module.css';

interface Props {
  price: Ticks;
  priceLabel: string;
  qtyDecimals: number;
  active: boolean;
}

export const rowId = (price: Ticks) => `ladder-row-${price}`;

/**
 * One price level. Each row subscribes to its own two numbers, so a book
 * update re-renders only rows whose size actually changed. Rows are keyed by
 * price: on recentre, rows for prices still on screen keep their instance
 * (and don't flash); only new prices mount.
 */
export const LadderRow = memo(function LadderRow({ price, priceLabel, qtyDecimals, active }: Props) {
  const bid = useAppSelector((s) => selectGroupedBook(s).bids.get(price) ?? 0);
  const ask = useAppSelector((s) => selectGroupedBook(s).asks.get(price) ?? 0);
  const lastSide = useAppSelector((s) => {
    const last = selectLastTrade(s);
    return last && last.row === price ? last.side : null;
  });

  const bidFlash = useFlashOnChange(bid);
  const askFlash = useFlashOnChange(ask);

  return (
    <div
      role="row"
      id={rowId(price)}
      className={styles.row}
      data-price={price}
      data-active={active || undefined}
    >
      <div role="gridcell" className={`${styles.size} ${styles.bid}`}>
        <span className={styles.bar} style={{ '--size': bid } as CSSProperties} aria-hidden />
        <span ref={bidFlash} className={styles.flash} aria-hidden />
        <span className="num">{bid ? bid.toFixed(qtyDecimals) : ''}</span>
      </div>
      <div role="gridcell" className={`${styles.price} num`} data-last={lastSide ?? undefined}>
        {priceLabel}
      </div>
      <div role="gridcell" className={`${styles.size} ${styles.ask}`}>
        <span className={styles.bar} style={{ '--size': ask } as CSSProperties} aria-hidden />
        <span ref={askFlash} className={styles.flash} aria-hidden />
        <span className="num">{ask ? ask.toFixed(qtyDecimals) : ''}</span>
      </div>
    </div>
  );
});

/**
 * Flash only significant changes after mount, at most once per cooldown.
 * Mounting (a recentre) is not a change. The largest size is read from the
 * store at that moment rather than subscribed to, so the row doesn't re-render
 * when another level's size changes.
 */
function useFlashOnChange(value: number) {
  const store = useStore<RootState>();
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const lastFlashAt = useRef(-Infinity);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === value) return;
    const now = performance.now();
    if (now - lastFlashAt.current < COOLDOWN_MS) return;
    if (!isSignificant(before, value, selectGroupedBook(store.getState()).maxSize)) return;
    lastFlashAt.current = now;
    flash(ref.current, value > before ? 'up' : 'down');
  }, [value, store]);
  return ref;
}
