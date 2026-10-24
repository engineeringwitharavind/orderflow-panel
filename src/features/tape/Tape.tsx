import { useMemo, useState, type KeyboardEvent } from 'react';
import { useStore } from 'react-redux';
import { List, useListRef } from 'react-window';
import { useAppSelector } from '../../app/hooks';
import type { RootState } from '../../app/store';
import { useTradeFeed } from '../../market/feeds';
import { getSpec } from '../../market/symbols';
import type { Trade } from '../../market/types';
import panel from '../layout/Panel.module.css';
import styles from './Tape.module.css';
import { TapeRow, tapeRowId, tradeAt, type TapeRowProps } from './TapeRow';

export const TAPE_ROW_HEIGHT = 20;
const PAGE_ROWS = 20;

interface Frozen {
  items: readonly Trade[];
  /** trades.seq at the moment of freezing; the gap to the live seq is the "N new" count. */
  seq: number;
}

export function Tape() {
  useTradeFeed();
  const symbol = useAppSelector((s) => s.market.symbol);
  return (
    <section className={panel.panel} aria-label="Trade tape">
      {/* New symbol, new tape: remount so freeze state and the active row start fresh. */}
      <TapeBody key={symbol} symbol={symbol} />
    </section>
  );
}

function TapeBody({ symbol }: { symbol: string }) {
  const spec = getSpec(symbol);
  const store = useStore<RootState>();
  const listRef = useListRef(null);

  // Live: newest at the top, updating every frame.
  // Frozen: you scrolled down or started navigating, so the list holds still
  // instead of sliding under you. While frozen, the selector returns null and
  // this component stops re-rendering on new trades altogether.
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const live = useAppSelector((s) => (frozen ? null : s.market.trades.items));
  const items = frozen?.items ?? live ?? [];

  const freeze = () => {
    if (frozen) return frozen;
    const { items, seq } = store.getState().market.trades;
    const next = { items, seq };
    setFrozen(next);
    return next;
  };

  const resume = () => {
    setFrozen(null);
    setActiveIndex(null);
    listRef.current?.scrollToRow({ index: 0, align: 'start' });
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const atTop = e.currentTarget.scrollTop < TAPE_ROW_HEIGHT / 2;
    if (!atTop && !frozen) freeze();
    else if (atTop && frozen && activeIndex === null) setFrozen(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowUp' ? -1
      : e.key === 'PageDown' ? PAGE_ROWS
      : e.key === 'PageUp' ? -PAGE_ROWS
      : 0;
    if (step) {
      e.preventDefault();
      const { items: held } = freeze();
      if (held.length === 0) return;
      const from = activeIndex ?? (step > 0 ? -1 : 0);
      const to = Math.max(0, Math.min(held.length - 1, from + step));
      setActiveIndex(to);
      listRef.current?.scrollToRow({ index: to, align: 'smart' });
    } else if (e.key === 'End') {
      e.preventDefault();
      const { items: held } = freeze();
      if (held.length === 0) return;
      setActiveIndex(held.length - 1);
      listRef.current?.scrollToRow({ index: held.length - 1, align: 'end' });
    } else if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault();
      resume();
    }
  };

  // rowProps must be stable: a new object re-renders every visible row.
  const rowProps = useMemo<TapeRowProps>(() => ({ items, spec, activeIndex }), [items, spec, activeIndex]);
  const active = activeIndex === null ? undefined : tradeAt(items, activeIndex);

  return (
    <>
      <h2 className={`${panel.title} ${styles.header}`}>
        <span>Tape</span>
        {frozen ? (
          <NewTrades since={frozen.seq} onResume={resume} />
        ) : (
          <span className={styles.meta}>
            live · <span className={`num ${styles.count}`}>{items.length.toLocaleString()}</span> trades
          </span>
        )}
      </h2>
      <div className={styles.columns} aria-hidden>
        <span>Time</span>
        <span>Side</span>
        <span className={styles.right}>Price</span>
        <span className={styles.right}>Size</span>
      </div>
      <div className={styles.body}>
        <List
          listRef={listRef}
          className={styles.list}
          role="listbox"
          aria-label={`${symbol} trades, newest first. Arrow keys move, Page Up and Page Down jump, Home returns to live.`}
          aria-activedescendant={active ? tapeRowId(active.id) : undefined}
          tabIndex={0}
          rowComponent={TapeRow}
          rowCount={items.length}
          rowHeight={TAPE_ROW_HEIGHT}
          rowProps={rowProps}
          overscanCount={5}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
        />
        {items.length === 0 && <div className={styles.empty}>Waiting for trades…</div>}
      </div>
    </>
  );
}

/** The only part of the tape that updates while it's frozen. Lives in the header so it never covers a row. */
function NewTrades({ since, onResume }: { since: number; onResume: () => void }) {
  const fresh = useAppSelector((s) => s.market.trades.seq - since);
  return (
    <button className={styles.resume} onClick={onResume}>
      paused · <span className="num">{fresh.toLocaleString()}</span> new · back to live (Home)
    </button>
  );
}
