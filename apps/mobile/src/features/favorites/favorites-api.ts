import type { UserFavoriteStationResponse } from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from '../onboarding/session-storage';

/** Typed API contract for user favorite-station operations. */
export interface FavoritesApi {
  listFavorites(userId: string): Promise<UserFavoriteStationResponse[]>;
  removeFavorite(userId: string, stationId: string): Promise<void>;
  saveFavorite(userId: string, stationId: string): Promise<UserFavoriteStationResponse>;
}

/** Creates favorites API helpers backed by the shared typed ApiClient. */
export function createFavoritesApi(apiClient: ApiClient): FavoritesApi {
  return {
    listFavorites: (userId: string): Promise<UserFavoriteStationResponse[]> => {
      return apiClient.get<UserFavoriteStationResponse[]>(`/users/${userId}/favorites`);
    },
    removeFavorite: (userId: string, stationId: string): Promise<void> => {
      return apiClient.delete<void>(`/users/${userId}/favorites/${stationId}`);
    },
    saveFavorite: (userId: string, stationId: string): Promise<UserFavoriteStationResponse> => {
      return apiClient.post<UserFavoriteStationResponse, undefined>(
        `/users/${userId}/favorites/${stationId}`,
        {},
      );
    },
  };
}

const defaultFavoritesApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/** Default favorites API instance for user favorite-station operations. */
export const favoritesApi = createFavoritesApi(defaultFavoritesApiClient);
