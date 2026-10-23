import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { SYMBOLS } from '../../market/symbols';
import { GROUPINGS, setGrouping, setSymbol, swapPanels, togglePanel } from '../../workspace/workspaceSlice';
import { ConnectionBadge } from './ConnectionBadge';
import styles from './Toolbar.module.css';

export function Toolbar() {
  const dispatch = useAppDispatch();
  const symbol = useAppSelector((s) => s.workspace.symbol);
  const { panels, ladderGrouping } = useAppSelector((s) => s.workspace.layout);

  return (
    <header className={styles.toolbar}>
      <label className={styles.field}>
        <span>Symbol</span>
        <select value={symbol} onChange={(e) => dispatch(setSymbol(e.target.value))}>
          {SYMBOLS.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Group</span>
        <select
          className="num"
          value={ladderGrouping}
          onChange={(e) => dispatch(setGrouping(Number(e.target.value)))}
        >
          {GROUPINGS.map((g) => (
            <option key={g} value={g}>
              {g} {g === 1 ? 'tick' : 'ticks'}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.group} role="group" aria-label="Panels">
        {(['ladder', 'tape'] as const).map((p) => (
          <button key={p} aria-pressed={panels.includes(p)} onClick={() => dispatch(togglePanel(p))}>
            {p === 'ladder' ? 'Ladder' : 'Tape'}
          </button>
        ))}
        <button disabled={panels.length < 2} onClick={() => dispatch(swapPanels())}>
          Swap
        </button>
      </div>

      <ConnectionBadge />
    </header>
  );
}
