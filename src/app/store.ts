import { combineReducers, configureStore, type Middleware } from '@reduxjs/toolkit';
import workspace from '../workspace/workspaceSlice';

const rootReducer = combineReducers({ workspace });

export type RootState = ReturnType<typeof rootReducer>;

export function setupStore(preloadedState?: Partial<RootState>, middleware: Middleware[] = []) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault().concat(middleware),
  });
}

export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];
