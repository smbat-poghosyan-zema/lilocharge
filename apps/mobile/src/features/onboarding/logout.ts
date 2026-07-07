import { clearCache, createApiCacheStorage } from '../../api/cache-interceptor';
import { favoritesStorage } from '../favorites/favorites-storage';
import { unregisterPushNotifications } from '../notifications/push-bootstrap';
import { onboardingSessionStorage } from './session-storage';

/** Overridable dependencies used by the logout sweep (primarily for tests). */
export interface LogoutSweepDeps {
  readonly clearApiCache?: () => void;
  readonly clearFavorites?: () => void;
  readonly clearSession?: () => void;
  readonly readUserId?: () => string | null;
  readonly unregisterPush?: (options: { readonly userId: string | null }) => Promise<void>;
}

/**
 * Performs the full logout sweep in one place: unregisters the device push
 * token for the still-known user, then clears favorites, the offline API
 * response cache, and the persisted session. Clearing the session notifies
 * session-storage subscribers, so the onboarding context resets and the app
 * routes back to onboarding without a cold restart.
 */
export function logoutSweep(deps: LogoutSweepDeps = {}): void {
  const readUserId = deps.readUserId ?? ((): string | null => onboardingSessionStorage.readSession().userId);
  const clearFavorites = deps.clearFavorites ?? ((): void => favoritesStorage.clearFavoriteStations());
  const clearApiCache = deps.clearApiCache ?? ((): void => clearCache(createApiCacheStorage()));
  const clearSession = deps.clearSession ?? ((): void => onboardingSessionStorage.clearSession());
  const unregisterPush = deps.unregisterPush ?? unregisterPushNotifications;

  const userId = readUserId();

  // Best-effort and fire-and-forget: token removal must never block logout, and
  // it reads the user id captured above before the session is cleared.
  void unregisterPush({ userId }).catch((): undefined => undefined);

  clearFavorites();
  clearApiCache();
  clearSession();
}
