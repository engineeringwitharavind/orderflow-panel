import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_SYMBOL, getSpec } from '../market/symbols';
import { TAB_ID } from './tabId';

export type PanelId = 'ladder' | 'tape';

export interface Layout {
  /** Visible panels, left to right. */
  panels: PanelId[];
  /** Width share of the left panel, 0..1. Only used when both are visible. */
  split: number;
  /** Ticks per ladder row. */
  ladderGrouping: number;
}

export interface WorkspaceState {
  symbol: string;
  layout: Layout;
  /** Bumped on every local edit. With `origin`, gives a total order across tabs. */
  rev: number;
  /** Tab that made the latest edit. */
  origin: string;
}

export const GROUPINGS = [1, 5, 10, 25, 50, 100] as const;
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;

export const initialWorkspace: WorkspaceState = {
  symbol: DEFAULT_SYMBOL,
  layout: { panels: ['ladder', 'tape'], split: 0.5, ladderGrouping: getSpec(DEFAULT_SYMBOL).defaultGrouping },
  rev: 0,
  origin: '',
};

/** True when `a` should replace `b`. Higher rev wins; equal revs break by origin. */
export function isNewer(a: Pick<WorkspaceState, 'rev' | 'origin'>, b: Pick<WorkspaceState, 'rev' | 'origin'>) {
  return a.rev > b.rev || (a.rev === b.rev && a.origin > b.origin);
}

export const clampSplit = (n: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n));

// Every local edit goes through `local`, so stamping rev/origin can't be forgotten.
// The tab id rides on the action (meta) rather than being read inside the reducer,
// which keeps the reducer pure and testable with any origin.
const local = <P>() => ({
  prepare: (payload: P) => ({ payload, meta: { origin: TAB_ID } }),
});

type LocalAction<P> = PayloadAction<P, string, { origin: string }>;

function stamp(state: WorkspaceState, action: LocalAction<unknown>) {
  state.rev += 1;
  state.origin = action.meta.origin;
}

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState: initialWorkspace,
  reducers: {
    setSymbol: {
      ...local<string>(),
      reducer(state, action: LocalAction<string>) {
        if (state.symbol === action.payload) return;
        state.symbol = action.payload;
        // A grouping means a different price range on each symbol, so a new symbol starts at its own default.
        state.layout.ladderGrouping = getSpec(action.payload).defaultGrouping;
        stamp(state, action);
      },
    },
    setSplit: {
      ...local<number>(),
      reducer(state, action: LocalAction<number>) {
        const split = clampSplit(action.payload);
        if (state.layout.split === split) return;
        state.layout.split = split;
        stamp(state, action);
      },
    },
    togglePanel: {
      ...local<PanelId>(),
      reducer(state, action: LocalAction<PanelId>) {
        const { panels } = state.layout;
        const i = panels.indexOf(action.payload);
        if (i >= 0) {
          if (panels.length === 1) return; // never hide the last panel
          panels.splice(i, 1);
        } else {
          // Re-showing keeps the canonical order: ladder left of tape unless swapped.
          if (action.payload === 'ladder') panels.unshift('ladder');
          else panels.push('tape');
        }
        stamp(state, action);
      },
    },
    swapPanels: {
      ...local<void>(),
      reducer(state, action: LocalAction<void>) {
        if (state.layout.panels.length < 2) return;
        state.layout.panels.reverse();
        stamp(state, action);
      },
    },
    setGrouping: {
      ...local<number>(),
      reducer(state, action: LocalAction<number>) {
        if (state.layout.ladderGrouping === action.payload) return;
        state.layout.ladderGrouping = action.payload;
        stamp(state, action);
      },
    },
    /** State from another tab. Applied only if it is newer, so stale or reordered messages are harmless. */
    remoteApplied(state, action: PayloadAction<WorkspaceState>) {
      return isNewer(action.payload, state) ? action.payload : state;
    },
  },
});

export const { setSymbol, setSplit, togglePanel, swapPanels, setGrouping, remoteApplied } =
  workspaceSlice.actions;

/** Actions that originate in this tab and must be persisted + broadcast. */
export const localWorkspaceActions = [setSymbol, setSplit, togglePanel, swapPanels, setGrouping];

export default workspaceSlice.reducer;
