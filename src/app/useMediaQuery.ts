import { useSyncExternalStore } from 'react';

/** True while the media query matches. useSyncExternalStore keeps it tear-free across a resize. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
