// BASELINE (naive): no virtualisation, no freeze. Every held trade is a DOM row.
import { useAppSelector } from '../../app/hooks';
import { useTradeFeed } from '../../market/feeds';
import { getSpec } from '../../market/symbols';
import panel from '../layout/Panel.module.css';
import { formatTime, isLargePrint } from './format';
import styles from './Tape.module.css';

export function Tape() {
  useTradeFeed();
  const symbol = useAppSelector((s) => s.market.symbol);
  const items = useAppSelector((s) => s.market.trades.items);
  const spec = getSpec(symbol);
  const rows = [...items].reverse();
  return (
    <section className={panel.panel} aria-label="Trade tape">
      <h2 className={`${panel.title} ${styles.header}`}>
        <span>Tape</span>
        <span className={styles.meta}>
          live · <span className="num">{items.length.toLocaleString()}</span> trades
        </span>
      </h2>
      <div className={styles.columns} aria-hidden>
        <span>Time</span>
        <span>Side</span>
        <span className={styles.right}>Price</span>
        <span className={styles.right}>Size</span>
      </div>
      <div className={styles.body} style={{ overflowY: 'auto' }} role="list" tabIndex={0}>
        {rows.map((t, i) => (
          <div
            key={i}
            role="listitem"
            className={styles.row}
            data-side={t.side}
            data-large={isLargePrint(t.price, t.qty, spec.tickSize) || undefined}
          >
            <span className={`${styles.time} num`}>{formatTime(t.ts)}</span>
            <span className={styles.side}>{t.side === 'buy' ? 'Buy' : 'Sell'}</span>
            <span className={`${styles.price} num`}>{(t.price * spec.tickSize).toFixed(spec.priceDecimals)}</span>
            <span className={`${styles.qty} num`}>{t.qty.toFixed(spec.qtyDecimals)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
