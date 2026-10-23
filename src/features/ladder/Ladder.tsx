import { useAppSelector } from '../../app/hooks';
import { useBookFeed } from '../../market/feeds';
import { getSpec } from '../../market/symbols';
import styles from '../layout/Panel.module.css';

// Placeholder until Block 3: proves the depth stream flows end to end.
export function Ladder() {
  useBookFeed();
  const symbol = useAppSelector((s) => s.market.symbol);
  const bestBid = useAppSelector((s) => s.market.book.bestBid);
  const bestAsk = useAppSelector((s) => s.market.book.bestAsk);
  const { tickSize, priceDecimals } = getSpec(symbol);
  const fmt = (t: number | null) => (t === null ? '—' : (t * tickSize).toFixed(priceDecimals));
  return (
    <section className={styles.panel} aria-label="Ladder">
      <h2 className={styles.title}>Ladder</h2>
      <p className="num">
        bid {fmt(bestBid)} / ask {fmt(bestAsk)}
      </p>
    </section>
  );
}
