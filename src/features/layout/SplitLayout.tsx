import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { SPLIT_MAX, SPLIT_MIN, clampSplit, setSplit, type PanelId } from '../../workspace/workspaceSlice';
import { Ladder } from '../ladder/Ladder';
import { Tape } from '../tape/Tape';
import styles from './SplitLayout.module.css';

const PANELS: Record<PanelId, () => React.JSX.Element> = { ladder: Ladder, tape: Tape };
const KEY_STEP = 0.02;

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

  const [first, second] = panels;
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
