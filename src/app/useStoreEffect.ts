import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import type { RootState } from './store';

/**
 * Runs `effect` whenever the selected value changes, without rendering.
 * For values that only drive a style (a CSS variable), going through React
 * state would re-render a whole subtree to change one property.
 */
export function useStoreEffect<T>(selector: (s: RootState) => T, effect: (value: T) => void) {
  const store = useStore<RootState>();
  const selectorRef = useRef(selector);
  const effectRef = useRef(effect);
  useLayoutEffect(() => {
    selectorRef.current = selector;
    effectRef.current = effect;
  });

  useLayoutEffect(() => {
    let prev = selectorRef.current(store.getState());
    effectRef.current(prev);
    return store.subscribe(() => {
      const next = selectorRef.current(store.getState());
      if (next !== prev) {
        prev = next;
        effectRef.current(next);
      }
    });
  }, [store]);
}
