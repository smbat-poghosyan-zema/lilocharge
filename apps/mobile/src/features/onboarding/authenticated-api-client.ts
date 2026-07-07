import { createApiClient, type ApiClient, type ApiClientConfig } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { refreshPersistedSession } from './session-refresh';
import { clearPersistedSession, getPersistedAccessToken } from './session-storage';

/** Overridable options accepted when building an authenticated API client. */
export type AuthenticatedApiClientOptions = Pick<
  ApiClientConfig,
  'cache' | 'defaultHeaders' | 'fetchFn'
>;

/**
 * Builds an API client wired to the shared persisted session: it injects the
 * bearer token, transparently refreshes an expired access token once on a 401
 * (single-flight across every client), and clears the session only when the
 * refresh ultimately fails. Every feature client is created through here so the
 * token-refresh behavior is centralized rather than duplicated per module.
 */
export function createAuthenticatedApiClient(
  options: AuthenticatedApiClientOptions = {},
): ApiClient {
  return createApiClient({
    baseUrl: getApiBaseUrl(),
    ...(options.cache !== undefined ? { cache: options.cache } : {}),
    ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
    defaultHeaders: {
      Accept: 'application/json',
      ...options.defaultHeaders,
    },
    getAccessToken: (): string | null => getPersistedAccessToken(),
    onUnauthorized: (): void => {
      clearPersistedSession();
    },
    refreshAuth: (): Promise<boolean> => refreshPersistedSession(),
  });
}
