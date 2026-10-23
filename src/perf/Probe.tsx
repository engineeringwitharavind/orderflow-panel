import { Profiler, type ReactNode } from 'react';
import { perf } from './collector';

/**
 * A named React Profiler. In a normal production build React strips profiling
 * and onRender never fires, so this costs nothing. `npm run build:profile`
 * swaps in react-dom/profiling to keep it on.
 */
export function Probe({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Profiler id={id} onRender={perf.onRender}>
      {children}
    </Profiler>
  );
}
