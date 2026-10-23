import { isKnownSymbol } from '../market/symbols';
import { GROUPINGS, clampSplit, type PanelId, type WorkspaceState } from './workspaceSlice';

export const STORAGE_KEY = 'orderflow:workspace';
const VERSION = 1;

interface Persisted {
  v: number;
  state: WorkspaceState;
}

/** localStorage can throw (private mode, blocked site data), so every access is guarded. */
export function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read synchronously, before the store exists, so the first render already has
 * the saved symbol and layout. Anything malformed or from an unknown version
 * falls back to defaults instead of crashing the app.
 */
export function loadWorkspace(storage: Storage | null = getStorage()): WorkspaceState | undefined {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.v !== VERSION) return undefined;
    return validate(parsed.state);
  } catch {
    return undefined;
  }
}

/** Written synchronously on every change. A debounced write would drop a change made just before reload. */
export function saveWorkspace(state: WorkspaceState, storage: Storage | null = getStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, state } satisfies Persisted));
  } catch {
    // Quota or blocked storage: the app keeps working, it just won't remember.
  }
}

const PANELS: readonly PanelId[] = ['ladder', 'tape'];

export function validate(s: unknown): WorkspaceState | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const w = s as Record<string, unknown>;
  const layout = w.layout as Record<string, unknown> | undefined;
  if (!isKnownSymbol(w.symbol) || !layout) return undefined;
  if (typeof w.rev !== 'number' || typeof w.origin !== 'string') return undefined;

  const panels = layout.panels;
  if (
    !Array.isArray(panels) ||
    panels.length < 1 ||
    panels.length > 2 ||
    !panels.every((p) => PANELS.includes(p)) ||
    new Set(panels).size !== panels.length
  ) {
    return undefined;
  }
  if (typeof layout.split !== 'number' || !Number.isFinite(layout.split)) return undefined;
  if (!GROUPINGS.includes(layout.ladderGrouping as (typeof GROUPINGS)[number])) return undefined;

  return {
    symbol: w.symbol,
    layout: {
      panels: panels as PanelId[],
      split: clampSplit(layout.split),
      ladderGrouping: layout.ladderGrouping as number,
    },
    rev: w.rev,
    origin: w.origin,
  };
}
