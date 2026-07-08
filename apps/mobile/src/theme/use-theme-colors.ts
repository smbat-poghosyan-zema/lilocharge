import { useColorScheme } from 'react-native';

/**
 * Scheme-aware literal colors for the handful of React Native APIs that take a `color`
 * prop rather than a `className` (`ActivityIndicator`, `TextInput` `placeholderTextColor`,
 * `StatusBar`, `RefreshControl`). className tokens flip automatically via the CSS
 * variables in `global.css`, but these native props cannot read a utility class, so this
 * hook mirrors the relevant tokens for the active color scheme (UX-P2-02 dark mode).
 *
 * The values here MUST stay in sync with the light/dark token channels in `global.css`.
 */
export interface ThemeColors {
  /** Brand teal — spinners on light surfaces. Kept dark enough for white text in both. */
  readonly primary: string;
  /** Foreground that sits on a saturated color (e.g. spinner on a primary button). */
  readonly onColor: string;
  /** Muted text / input placeholder — AA-tuned in both schemes. */
  readonly muted: string;
  /** Primary body text color. */
  readonly text: string;
}

const LIGHT_THEME_COLORS: ThemeColors = {
  primary: '#0F766E',
  onColor: '#FFFFFF',
  muted: '#626B78',
  text: '#111827',
};

const DARK_THEME_COLORS: ThemeColors = {
  primary: '#0F766E',
  onColor: '#FFFFFF',
  muted: '#9CA3AF',
  text: '#F9FAFB',
};

/**
 * Returns the literal color set for the current device color scheme. Defaults to light
 * when the scheme is `null`/unknown (matches NativeWind's default resolution).
 */
export function useThemeColors(): ThemeColors {
  return useColorScheme() === 'dark' ? DARK_THEME_COLORS : LIGHT_THEME_COLORS;
}
