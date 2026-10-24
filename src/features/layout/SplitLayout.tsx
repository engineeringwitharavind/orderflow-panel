import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useMediaQuery } from '../../app/useMediaQuery';
import { SPLIT_MAX, SPLIT_MIN, clampSplit, setSplit, type PanelId } from '../../workspace/workspaceSlice';
import { Probe } from '../../perf/Probe';
import { Ladder } from '../ladder/Ladder';
import { Tape } from '../tape/Tape';
import styles from './SplitLayout.module.css';

// Each panel has its own Profiler so the README can report ladder and tape commits separately.
const PANELS: Record<PanelId, () => React.JSX.Element> = {
  ladder: () => (
    <Probe id="ladder">
      <Ladder />
    </Probe>
  ),
  tape: () => (
    <Probe id="tape">
      <Tape />
    </Probe>
  ),
};
const KEY_STEP = 0.02;
const LABEL: Record<PanelId, string> = { ladder: 'Ladder', tape: 'Tape' };
/** Below this, two panels side by side cut off their numbers, so they become tabs. */
export const NARROW_QUERY = '(max-width: 700px)';

/**
 * While dragging, only the --split CSS variable on this element changes: no
 * Redux action, no re-render, no localStorage write, no broadcast per pointer
 * move. One setSplit on release commits it (and syncs other tabs).
 */
export function SplitLayout() {
  const dispatch = useAppDispatch();
  const panels = useAppSelector((s) => s.workspace.layout.panels);
  const split = useAppSelector((s) => s.workspace.layout.split);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ left: number; width: number; value: number } | null>(null);
  const narrow = useMediaQuery(NARROW_QUERY);
  const [tab, setTab] = useState<PanelId>('ladder');

  const [first, second] = panels;
  // Phone: both panels are always tabs. Hiding a panel is a setting for the desktop
  // split; carried over here it would leave one tab and no way back (the toolbar's
  // show/hide is hidden on phones).
  if (narrow) {
    const order: [PanelId, PanelId] = second ? [first!, second] : first === 'tape' ? ['tape', 'ladder'] : ['ladder', 'tape'];
    return <PanelTabs panels={order} active={tab} onSelect={setTab} />;
  }

  const First = PANELS[first!];
  if (!second) {
    return (
      <div className={styles.single}>
        <First />
      </div>
    );
  }
  const Second = PANELS[second];

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = rootRef.current!.getBoundingClientRect();
    dragRef.current = { left: rect.left, width: rect.width, value: split };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.value = clampSplit((e.clientX - drag.left) / drag.width);
    rootRef.current!.style.setProperty('--split', String(drag.value));
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag) dispatch(setSplit(drag.value));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowLeft' ? split - KEY_STEP
      : e.key === 'ArrowRight' ? split + KEY_STEP
      : e.key === 'Home' ? SPLIT_MIN
      : e.key === 'End' ? SPLIT_MAX
      : null;
    if (next === null) return;
    e.preventDefault();
    dispatch(setSplit(Math.round(next * 100) / 100));
  };

  return (
    <div ref={rootRef} className={styles.split} style={{ '--split': split } as CSSProperties}>
      <First />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuemin={SPLIT_MIN * 100}
        aria-valuemax={SPLIT_MAX * 100}
        aria-valuenow={Math.round(split * 100)}
        tabIndex={0}
        className={styles.divider}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <Second />
    </div>
  );
}

/**
 * Phone layout: one panel at a time behind a tab bar. Both panels stay mounted
 * (the hidden one with the `hidden` attribute), so their streams keep running
 * and the tape has no gap when you switch back.
 */
function PanelTabs({
  panels,
  active,
  onSelect,
}: {
  panels: [PanelId, PanelId];
  active: PanelId;
  onSelect: (p: PanelId) => void;
}) {
  const tabRefs = useRef<Partial<Record<PanelId, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = panels[(panels.indexOf(active) + 1) % 2]!;
    onSelect(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label="Panels" className={styles.tablist} onKeyDown={onKeyDown}>
        {panels.map((p) => (
          <button
            key={p}
            ref={(el) => {
              tabRefs.current[p] = el;
            }}
            role="tab"
            id={`tab-${p}`}
            aria-selected={p === active}
            aria-controls={`tabpanel-${p}`}
            tabIndex={p === active ? 0 : -1}
            className={styles.tab}
            onClick={() => onSelect(p)}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>
      {panels.map((p) => {
        const Panel = PANELS[p];
        return (
          <div key={p} role="tabpanel" id={`tabpanel-${p}`} aria-labelledby={`tab-${p}`} hidden={p !== active} className={styles.tabpanel}>
            <Panel />
          </div>
        );
      })}
    </div>
  );
}
