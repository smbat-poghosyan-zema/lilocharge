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

/**
 * Muted body text — `text-muted` / `neutral-500`. Darkened from the original #6B7280
 * (4.39:1 on the #F3F4F6 background — below WCAG AA) to #626B78 (~4.9:1) so muted text and
 * input placeholders pass AA. Mirrors `--color-neutral-500` / `--color-text-muted` (light).
 */
export const NEUTRAL_500 = '#626B78';

/** Primary text / darkest neutral — `neutral-900` / `text`. */
export const NEUTRAL_900 = '#111827';

/** Destructive red — `danger` DEFAULT. */
export const DANGER = '#DC2626';

/** Positive green — `success` DEFAULT. */
export const SUCCESS = '#16A34A';

/** Warning amber — `warning` DEFAULT. */
export const WARNING = '#D97706';

/**
 * Map-only cluster gradient tints for Mapbox `CircleLayer` step expressions. These live
 * here (not `tailwind.config.js`) because they are consumed exclusively by Mapbox layer
 * `style` objects, which take literal color values rather than `className` tokens. The
 * high tier reuses {@link SUCCESS} so the densest clusters read as the same green as an
 * AVAILABLE station pin.
 */
export const MAP_CLUSTER_LOW = '#A7F3D0';
export const MAP_CLUSTER_MID = '#4ADE80';
export const MAP_CLUSTER_HIGH = SUCCESS;
