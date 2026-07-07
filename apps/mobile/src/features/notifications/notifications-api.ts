import type {
  RegisterPushTokenRequest,
  UnregisterPushTokenRequest,
} from '@lilocharge/shared-types';

import type { ApiClient } from '../../api';
import { createAuthenticatedApiClient } from '../onboarding/authenticated-api-client';

/** Typed API contract for push-token registration operations. */
export interface NotificationsApi {
  registerPushToken(userId: string, payload: RegisterPushTokenRequest): Promise<void>;
  unregisterPushToken(userId: string, payload: UnregisterPushTokenRequest): Promise<void>;
}

/** Creates push-token notification APIs backed by the shared typed ApiClient. */
export function createNotificationsApi(apiClient: ApiClient): NotificationsApi {
  return {
    registerPushToken: (userId: string, payload: RegisterPushTokenRequest): Promise<void> => {
      return apiClient.post<void, RegisterPushTokenRequest>(
        `/users/${userId}/notifications/push-tokens`,
        {
          body: payload,
        },
      );
    },

    unregisterPushToken: (userId: string, payload: UnregisterPushTokenRequest): Promise<void> => {
      return apiClient.post<void, UnregisterPushTokenRequest>(
        `/users/${userId}/notifications/push-tokens/unregister`,
        {
          body: payload,
        },
      );
    },
  };
}

const defaultNotificationsApiClient = createAuthenticatedApiClient();

/** Default notifications API instance for mobile push-token registration flows. */
export const notificationsApi = createNotificationsApi(defaultNotificationsApiClient);
