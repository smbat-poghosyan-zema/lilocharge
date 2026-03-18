import Mapbox from '@rnmapbox/maps';

let isMapboxConfigured = false;

/** Setter function signature used to inject Mapbox token initialization for testing. */
export type MapboxAccessTokenSetter =
  | ((accessToken: string | null) => Promise<string | null>)
  | ((accessToken: string | null) => string | null)
  | ((accessToken: string | null) => void);

/**
 * Configures the Mapbox SDK once when a valid access token is available.
 */
export function configureMapboxSdk(
  accessToken: string | null | undefined,
  setAccessToken: MapboxAccessTokenSetter = Mapbox.setAccessToken,
): boolean {
  const normalizedAccessToken = accessToken?.trim();

  if (!normalizedAccessToken || isMapboxConfigured) {
    return false;
  }

  void setAccessToken(normalizedAccessToken);
  isMapboxConfigured = true;

  return true;
}

/**
 * Resets SDK configuration state for deterministic unit tests.
 */
export function resetMapboxSdkConfigurationForTests(): void {
  isMapboxConfigured = false;
}
