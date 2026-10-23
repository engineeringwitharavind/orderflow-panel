import { combineReducers, configureStore, type Middleware, type Reducer, type UnknownAction } from '@reduxjs/toolkit';
import market, { initialMarket } from '../market/marketSlice';
import connection from '../ws/connectionSlice';
import workspace from '../workspace/workspaceSlice';

const combined = combineReducers({ workspace, market, connection });

export type RootState = ReturnType<typeof combined>;

/**
 * One invariant on top of the slices: market data always belongs to the
 * selected symbol. Enforced here, in the same dispatch that changes the
 * symbol (local or from another tab), so no render ever pairs the new symbol
 * with the old book.
 */
const rootReducer: Reducer<RootState, UnknownAction, Partial<RootState>> = (state, action) => {
  const next = combined(state, action);
  if (next.market.symbol !== next.workspace.symbol) {
    return { ...next, market: initialMarket(next.workspace.symbol) };
  }
  return next;
};

export function setupStore(preloadedState?: Partial<RootState>, middleware: Middleware[] = []) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault({
        // RTK's dev-only checks walk the whole state on every action. With a
        // 5,000-trade tape at 60 frames/s that dominates dev profiles, and the
        // market slice is replaced wholesale, never mutated.
        immutableCheck: { ignoredPaths: ['market'] },
        serializableCheck: { ignoredPaths: ['market'], ignoredActions: ['market/frameFlushed'] },
      }).concat(middleware),
  });
}

export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];
