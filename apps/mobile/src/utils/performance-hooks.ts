import { useCallback, useRef } from 'react';

/**
 * Creates a debounced version of a callback that delays execution.
 */
export function useDebouncedCallback<TArgs extends readonly unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: TArgs) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delayMs);
    },
    [callback, delayMs],
  );
}

/**
 * Creates a throttled version of a callback that limits execution frequency.
 */
export function useThrottledCallback<TArgs extends readonly unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: TArgs) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= delayMs) {
        lastCallRef.current = now;
        callback(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callback(...args);
        }, delayMs - timeSinceLastCall);
      }
    },
    [callback, delayMs],
  );
}
