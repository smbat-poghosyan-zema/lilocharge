import { useEffect, useState } from 'react';

/**
 * Returns a debounced mirror of the provided value after the given delay.
 */
export function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState<TValue>(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}
