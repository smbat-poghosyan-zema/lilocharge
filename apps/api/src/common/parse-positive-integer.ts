/**
 * Parses a positive integer from an optional raw string and falls back when missing or invalid.
 *
 * Any value that is absent, non-numeric, non-integer, or not strictly greater than zero yields
 * the provided fallback.
 */
export function parsePositiveIntegerOrDefault(rawValue: string | undefined, fallback: number): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}
