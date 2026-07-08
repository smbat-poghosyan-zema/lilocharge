/**
 * Literal token color values for the handful of React Native APIs that take a `color`
 * prop rather than a `className` (e.g. `ActivityIndicator`, `StatusBar`, `RefreshControl`).
 *
 * `tailwind.config.js` is the SINGLE SOURCE OF TRUTH for the design palette; these
 * constants MIRROR the semantic tokens defined there and MUST be kept in sync with it.
 * Prefer `className` tokens everywhere they work — only reach for these constants where a
 * native API cannot accept a utility class.
 */

/** Brand teal — `primary` DEFAULT. Used for the primary action + loading spinners. */
export const PRIMARY = '#0F766E';

/** Surface white — `neutral-0`. Used for spinners/icons rendered on colored surfaces. */
export const NEUTRAL_0 = '#FFFFFF';

/** Muted body text — `text-muted` / `neutral-500`. */
export const NEUTRAL_500 = '#6B7280';

/** Destructive red — `danger` DEFAULT. */
export const DANGER = '#DC2626';

/** Positive green — `success` DEFAULT. */
export const SUCCESS = '#16A34A';

/** Warning amber — `warning` DEFAULT. */
export const WARNING = '#D97706';
