/**
 * Normalizes an Expo Router route param into a single trimmed non-empty string, or null.
 *
 * Array params collapse to their first element; blank or missing values yield null so callers
 * can treat an absent id uniformly.
 */
export function normalizeRouteParam(value: string | string[] | undefined): string | null {
  const singleValue = Array.isArray(value) ? value[0] : value;
  const normalizedValue = singleValue?.trim() ?? '';

  return normalizedValue.length > 0 ? normalizedValue : null;
}
