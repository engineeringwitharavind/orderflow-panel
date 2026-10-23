import { useAppSelector } from '../../app/hooks';
import { useTradeFeed } from '../../market/feeds';
import styles from '../layout/Panel.module.css';

// Placeholder until Block 4: proves the trade stream flows end to end.
export function Tape() {
  useTradeFeed();
  const seq = useAppSelector((s) => s.market.trades.seq);
  return (
    <section className={styles.panel} aria-label="Trade tape">
      <h2 className={styles.title}>Tape</h2>
      <p className="num">{seq} trades received</p>
    </section>
  );
}
