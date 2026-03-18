import { PushNotificationPlatform } from '@lilocharge/shared-types';

import type { ApiClient, ApiRequestMethod, ApiRequestOptions } from '../../api/api-client';
import { createNotificationsApi } from './notifications-api';

describe('createNotificationsApi', () => {
  it('registers one FCM token for a user', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue(undefined);
    const notificationsApi = createNotificationsApi(apiClientMock);

    await notificationsApi.registerPushToken('user-id', {
      platform: PushNotificationPlatform.ANDROID,
      token: 'fcm-token-1',
    });

    expect(apiClientMock.post.mock.calls).toEqual([
      [
        '/users/user-id/notifications/push-tokens',
        {
          body: {
            platform: PushNotificationPlatform.ANDROID,
            token: 'fcm-token-1',
          },
        },
      ],
    ]);
  });

  it('unregisters one FCM token for a user', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue(undefined);
    const notificationsApi = createNotificationsApi(apiClientMock);

    await notificationsApi.unregisterPushToken('user-id', {
      token: 'fcm-token-1',
    });

    expect(apiClientMock.post.mock.calls).toEqual([
      [
        '/users/user-id/notifications/push-tokens/unregister',
        {
          body: {
            token: 'fcm-token-1',
          },
        },
      ],
    ]);
  });
});

/**
 * Creates one lightweight ApiClient mock for notifications API unit tests.
 */
function createApiClientMock(): jest.Mocked<ApiClient> {
  return {
    delete: jest.fn<
      Promise<unknown>,
      [path: string, options?: ApiRequestOptions<undefined, unknown>]
    >(),
    get: jest.fn<
      Promise<unknown>,
      [path: string, options?: ApiRequestOptions<undefined, unknown>]
    >(),
    patch: jest.fn<
      Promise<unknown>,
      [path: string, options: ApiRequestOptions<unknown, unknown>]
    >(),
    post: jest.fn<Promise<unknown>, [path: string, options: ApiRequestOptions<unknown, unknown>]>(),
    put: jest.fn<Promise<unknown>, [path: string, options: ApiRequestOptions<unknown, unknown>]>(),
    request: jest.fn<
      Promise<unknown>,
      [method: ApiRequestMethod, path: string, options?: ApiRequestOptions<unknown, unknown>]
    >(),
  } as unknown as jest.Mocked<ApiClient>;
}
