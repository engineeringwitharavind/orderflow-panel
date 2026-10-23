import type { RowComponentProps } from 'react-window';
import type { SymbolSpec } from '../../market/symbols';
import type { Trade } from '../../market/types';
import { formatTime, isLargePrint } from './format';
import styles from './Tape.module.css';

export interface TapeRowProps {
  /** Oldest first, as stored. Row 0 shows the newest. */
  items: readonly Trade[];
  spec: SymbolSpec;
  activeIndex: number | null;
}

export const tapeRowId = (tradeId: number) => `tape-${tradeId}`;
export const tradeAt = (items: readonly Trade[], index: number) => items[items.length - 1 - index];

/** Rendered only for the ~30 visible rows (plus overscan), however many trades are held. */
export function TapeRow({
  index,
  style,
  ariaAttributes,
  items,
  spec,
  activeIndex,
}: RowComponentProps<TapeRowProps>) {
  const t = tradeAt(items, index);
  if (!t) return null;
  const price = (t.price * spec.tickSize).toFixed(spec.priceDecimals);
  const qty = t.qty.toFixed(spec.qtyDecimals);
  return (
    <div
      {...ariaAttributes}
      role="option"
      aria-selected={index === activeIndex}
      id={tapeRowId(t.id)}
      style={style}
      className={styles.row}
      data-side={t.side}
      data-large={isLargePrint(t.price, t.qty, spec.tickSize) || undefined}
      data-active={index === activeIndex || undefined}
    >
      <span className={`${styles.time} num`}>{formatTime(t.ts)}</span>
      {/* Side is spelled out, not only coloured: colour can't be the only carrier of meaning. */}
      <span className={styles.side}>{t.side === 'buy' ? 'Buy' : 'Sell'}</span>
      <span className={`${styles.price} num`}>{price}</span>
      <span className={`${styles.qty} num`}>{qty}</span>
    </div>
  );
}
