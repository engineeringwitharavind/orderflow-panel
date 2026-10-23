import { useEffect, useLayoutEffect, useRef } from 'react';
import type { StreamKey } from './adapters/types';
import type { Handler } from './ConnectionManager';
import { useRuntime } from './runtime';

/**
 * Subscribes for as long as the calling component is mounted with this stream.
 * Unmount, or a new stream key, unsubscribes. The handler lives in a ref, so an
 * inline arrow function doesn't cause a resubscribe on every render.
 */
export function useStream(stream: StreamKey | null, onMessage: Handler) {
  const { manager } = useRuntime();
  const handlerRef = useRef(onMessage);
  useLayoutEffect(() => {
    handlerRef.current = onMessage;
  });

  useEffect(() => {
    if (!stream) return;
    return manager.subscribe(stream, (data, key) => handlerRef.current(data, key));
  }, [manager, stream]);
}
