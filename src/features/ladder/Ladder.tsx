import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useStore } from 'react-redux';
import { useAppSelector } from '../../app/hooks';
import type { RootState } from '../../app/store';
import { useStoreEffect } from '../../app/useStoreEffect';
import { useBookFeed } from '../../market/feeds';
import { selectGroupedBook } from '../../market/selectors';
import { getSpec } from '../../market/symbols';
import type { Ticks } from '../../market/types';
import panel from '../layout/Panel.module.css';
import styles from './Ladder.module.css';
import { LadderRow, rowId } from './LadderRow';
import { anchorToShow, barScale, centreOf, groupBid, needsRecentre, windowPrices } from './ladderMath';

export const ROW_HEIGHT = 20;
const PAGE_ROWS = 10;

export function Ladder() {
  useBookFeed();
  const symbol = useAppSelector((s) => s.market.symbol);
  const grouping = useAppSelector((s) => s.workspace.layout.ladderGrouping);
  return (
    <section className={panel.panel} aria-label="Ladder">
      <LadderHeader symbol={symbol} grouping={grouping} />
      {/* A new symbol or grouping is a new price grid: remount so anchor, focus row and follow mode start fresh. */}
      <LadderBody key={`${symbol}:${grouping}`} symbol={symbol} grouping={grouping} />
    </section>
  );
}

function LadderHeader({ symbol, grouping }: { symbol: string; grouping: number }) {
  const spread = useAppSelector((s) => {
    const { bestBid, bestAsk } = s.market.book;
    return bestBid === null || bestAsk === null ? null : bestAsk - bestBid;
  });
  const { tickSize, priceDecimals } = getSpec(symbol);
  return (
    <h2 className={`${panel.title} ${styles.header}`}>
      <span>Ladder</span>
      <span className={styles.meta}>
        spread <span className="num">{spread === null ? '—' : (spread * tickSize).toFixed(priceDecimals)}</span>
        {grouping > 1 && (
          <>
            {' · '}row <span className="num">{(grouping * tickSize).toFixed(priceDecimals)}</span>
          </>
        )}
      </span>
    </h2>
  );
}

function LadderBody({ symbol, grouping }: { symbol: string; grouping: number }) {
  const { tickSize, priceDecimals, qtyDecimals } = getSpec(symbol);
  const gridRef = useRef<HTMLDivElement>(null);
  const rows = useVisibleRows(gridRef);

  const [anchor, setAnchor] = useState<Ticks | null>(null);
  const [active, setActive] = useState<Ticks | null>(null);
  // Follow mode: the grid recentres itself when the market walks off the edge.
  // Navigating past the edge turns it off; C (or Home) recentres and turns it back on.
  const [follow, setFollow] = useState(true);

  // This selector returns a boolean, so the body re-renders only when the answer flips,
  // not on every book update.
  const offCentre = useAppSelector((s) => {
    const { bestBid, bestAsk } = s.market.book;
    if (bestBid === null || bestAsk === null || rows === 0) return false;
    return anchor === null || needsRecentre(anchor, rows, grouping, bestBid, bestAsk);
  });

  const recentre = useCallback(
    (store: { bestBid: Ticks | null; bestAsk: Ticks | null }) => {
      if (store.bestBid === null || store.bestAsk === null) return false;
      setAnchor(centreOf(store.bestBid, store.bestAsk, grouping));
      return true;
    },
    [grouping],
  );

  // Read the book on demand, never subscribe to it: it is a new object every
  // update, and subscribing would re-render the whole body 10 times a second.
  const store = useStore<RootState>();
  const readBook = () => store.getState().market.book;

  // A layout effect, not useEffect: when the market jumps out of the window, the
  // recentre must happen before paint, or one frame shows the book off-screen.
  useLayoutEffect(() => {
    if (offCentre && (follow || anchor === null)) recentre(store.getState().market.book);
  }, [offCentre, follow, anchor, recentre, store]);

  // Bar scale: one CSS variable on the grid, written directly, so no row
  // re-renders when the largest size changes. Stepped (barScale) because each
  // write restyles the whole ladder; useStoreEffect skips unchanged values.
  useStoreEffect(
    (s) => barScale(selectGroupedBook(s).maxSize),
    (max) => gridRef.current?.style.setProperty('--max', String(max)),
  );

  const prices = anchor === null || rows === 0 ? [] : windowPrices(anchor, rows, grouping);

  const moveActive = (to: Ticks) => {
    setActive(to);
    if (anchor === null) return;
    const next = anchorToShow(anchor, rows, grouping, to);
    if (next !== anchor) {
      setAnchor(next);
      setFollow(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (anchor === null) return;
    const { bestBid } = readBook();
    const from = active ?? (bestBid === null ? anchor : groupBid(bestBid, grouping));
    const step =
      e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowDown' ? -1
      : e.key === 'PageUp' ? PAGE_ROWS
      : e.key === 'PageDown' ? -PAGE_ROWS
      : 0;
    if (step) {
      e.preventDefault();
      moveActive(from + step * grouping);
    } else if (e.key === 'c' || e.key === 'C' || e.key === 'Home') {
      e.preventDefault();
      if (recentre(readBook())) {
        setFollow(true);
        setActive(null);
      }
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  return (
    <div className={styles.body}>
      <div className={styles.columns} aria-hidden>
        <span>Bid</span>
        <span>Price</span>
        <span>Ask</span>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`${symbol} price ladder. Arrow keys move, Page Up and Page Down jump, C recentres.`}
        aria-activedescendant={active !== null && prices.includes(active) ? rowId(active) : undefined}
        tabIndex={0}
        className={styles.grid}
        style={{ '--row-h': `${ROW_HEIGHT}px` } as CSSProperties}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          const row = (e.target as HTMLElement).closest<HTMLElement>('[data-price]');
          if (row) setActive(Number(row.dataset.price));
        }}
      >
        {prices.length === 0 ? (
          <div className={styles.empty}>Waiting for the book…</div>
        ) : (
          prices.map((p) => (
            <LadderRow
              key={p}
              price={p}
              priceLabel={(p * tickSize).toFixed(priceDecimals)}
              qtyDecimals={qtyDecimals}
              active={p === active}
            />
          ))
        )}
      </div>
      {!follow && (
        <div className={styles.paused} role="status">
          Auto-centre off · press C to recentre
        </div>
      )}
    </div>
  );
}

/** Rows that fit the grid's height. Fixed row height means no measuring of rows themselves. */
function useVisibleRows(ref: React.RefObject<HTMLDivElement | null>) {
  const [rows, setRows] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRows(Math.max(1, Math.floor(el.clientHeight / ROW_HEIGHT)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return rows;
}
