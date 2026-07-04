import type { SupportedLanguageCode } from '@lilocharge/shared-types';

export type RootTabRoute = 'favorites' | 'profile' | 'stations';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const INITIAL_TAB_BY_LANGUAGE: Readonly<Record<SupportedLanguageCode, RootTabRoute>> = {
  en: 'stations',
  hy: 'stations',
  ru: 'stations',
};

/**
 * Resolves the mobile API base URL from environment configuration.
 */
export function resolveApiBaseUrl(envValue: string | undefined): string {
  const normalized = envValue?.trim();

  return normalized && normalized.length > 0 ? normalized : DEFAULT_API_BASE_URL;
}

/**
 * Returns the API base URL from the EXPO_PUBLIC_API_URL environment variable.
 *
 * Expo statically inlines EXPO_PUBLIC_* variables at bundle time, so the
 * literal `process.env.EXPO_PUBLIC_API_URL` expression must appear here.
 */
export function getApiBaseUrl(): string {
  return resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
}

/**
 * Resolves the Mapbox access token from environment configuration.
 */
export function resolveMapboxAccessToken(envValue: string | undefined): string | null {
  const normalized = envValue?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

/**
 * Resolves the Apple Pay merchant identifier from environment configuration.
 */
export function resolveApplePayMerchantIdentifier(envValue: string | undefined): string | null {
  const normalized = envValue?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

/**
 * Resolves the Google Pay merchant identifier from environment configuration.
 */
export function resolveGooglePayMerchantIdentifier(envValue: string | undefined): string | null {
  const normalized = envValue?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

/**
 * Resolves the initial tab route for a given supported language.
 */
export function resolveInitialTabRoute(language: SupportedLanguageCode): RootTabRoute {
  return INITIAL_TAB_BY_LANGUAGE[language];
}
