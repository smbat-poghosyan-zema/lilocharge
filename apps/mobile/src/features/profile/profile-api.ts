import type {
  SupportedLanguageCode,
  UpdateUserLanguageRequest,
  UserProfileResponse,
  VehicleResponse,
} from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from '../onboarding/session-storage';

/**
 * Typed API contract for mobile profile management operations.
 */
export interface ProfileApi {
  getUserProfile(userId: string): Promise<UserProfileResponse>;
  getUserVehicles(userId: string): Promise<VehicleResponse[]>;
  updateUserLanguage(
    userId: string,
    language: SupportedLanguageCode,
  ): Promise<UserProfileResponse>;
}

/**
 * Creates profile API helpers backed by the shared typed ApiClient.
 */
export function createProfileApi(apiClient: ApiClient): ProfileApi {
  return {
    getUserProfile: (userId: string): Promise<UserProfileResponse> => {
      return apiClient.get<UserProfileResponse>(`/users/${userId}`);
    },

    getUserVehicles: (userId: string): Promise<VehicleResponse[]> => {
      return apiClient.get<VehicleResponse[]>(`/users/${userId}/vehicles`);
    },

    updateUserLanguage: (
      userId: string,
      language: SupportedLanguageCode,
    ): Promise<UserProfileResponse> => {
      return apiClient.patch<UserProfileResponse, UpdateUserLanguageRequest>(
        `/users/${userId}/language`,
        {
          body: { language },
        },
      );
    },
  };
}

const defaultProfileApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/**
 * Default profile API instance for the mobile profile screen.
 */
export const profileApi = createProfileApi(defaultProfileApiClient);
