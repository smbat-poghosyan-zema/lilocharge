import type { UserFavoriteStationResponse } from '@lilocharge/shared-types';

import type { ApiClient } from '../../api';
import { createAuthenticatedApiClient } from '../onboarding/authenticated-api-client';

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

const defaultFavoritesApiClient = createAuthenticatedApiClient();

/** Default favorites API instance for user favorite-station operations. */
export const favoritesApi = createFavoritesApi(defaultFavoritesApiClient);
