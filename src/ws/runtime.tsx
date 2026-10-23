import { createContext, useContext, type ReactNode } from 'react';
import type { FrameBatcher } from '../market/frameBatcher';
import type { ConnectionManager } from './ConnectionManager';

export interface Runtime {
  manager: ConnectionManager;
  batcher: FrameBatcher;
}

const RuntimeContext = createContext<Runtime | null>(null);

/** The socket and batcher are long-lived objects, not state. Context hands them to components without Redux. */
export function RuntimeProvider({ value, children }: { value: Runtime; children: ReactNode }) {
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime must be used inside <RuntimeProvider>');
  return runtime;
}
