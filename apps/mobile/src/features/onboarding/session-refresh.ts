import type { AuthTokenPairResponse } from '@lilocharge/shared-types';

import { getApiBaseUrl } from '../../config/runtime';
import { extractUserIdFromAccessToken } from './auth-token';
import { onboardingSessionStorage, type SessionStorage } from './session-storage';

/** Overridable dependencies used by the session refresh flow (primarily for tests). */
export interface SessionRefreshDeps {
  readonly baseUrl?: string;
  readonly fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
  readonly storage?: Pick<SessionStorage, 'clearSession' | 'readSession' | 'setTokenPair'>;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Attempts to refresh the persisted access token using the stored refresh token.
 *
 * Concurrent callers share a single in-flight refresh (single-flight), so a burst
 * of parallel 401s triggers exactly one `POST /auth/refresh`. Resolves `true` when
 * a new token pair was persisted (caller should retry); resolves `false` — after
 * clearing the persisted session — when no valid refresh token exists or the
 * refresh request fails.
 */
export function refreshPersistedSession(deps: SessionRefreshDeps = {}): Promise<boolean> {
  if (refreshInFlight !== null) {
    return refreshInFlight;
  }

  refreshInFlight = performSessionRefresh(deps).finally((): void => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Executes one refresh round-trip and reconciles persisted session state.
 */
async function performSessionRefresh(deps: SessionRefreshDeps): Promise<boolean> {
  const storage = deps.storage ?? onboardingSessionStorage;
  const refreshToken = storage.readSession().refreshToken;

  if (refreshToken === null) {
    storage.clearSession();

    return false;
  }

  const baseUrl = (deps.baseUrl ?? getApiBaseUrl()).replace(/\/+$/, '');
  const fetchFn = deps.fetchFn ?? fetch.bind(globalThis);

  try {
    const response = await fetchFn(`${baseUrl}/auth/refresh`, {
      body: JSON.stringify({ refreshToken }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      storage.clearSession();

      return false;
    }

    const tokenPair = parseTokenPair(await response.json());

    if (tokenPair === null) {
      storage.clearSession();

      return false;
    }

    storage.setTokenPair(tokenPair, extractUserIdFromAccessToken(tokenPair.accessToken));

    return true;
  } catch {
    storage.clearSession();

    return false;
  }
}

/**
 * Validates an unknown JSON payload as an auth token pair response.
 */
function parseTokenPair(
  value: unknown,
): Pick<AuthTokenPairResponse, 'accessToken' | 'refreshToken'> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken.length === 0 ||
    typeof candidate.refreshToken !== 'string' ||
    candidate.refreshToken.length === 0
  ) {
    return null;
  }

  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
  };
}
