import { PushNotificationPlatform } from '@lilocharge/shared-types';

import type { FcmMessagingAdapter, InitializeFcmRuntimeInput } from './fcm-runtime';
import type { NotificationsApi } from './notifications-api';
import {
  bootstrapPushNotifications,
  isPushNotificationsEnabled,
  resolvePushNotificationPlatform,
} from './push-bootstrap';

describe('isPushNotificationsEnabled', () => {
  it.each(['1', 'true', 'TRUE', ' true '])('enables push for flag value "%s"', (value: string) => {
    expect(isPushNotificationsEnabled(value)).toBe(true);
  });

  it.each([undefined, '', '0', 'false', 'no', 'off'])(
    'keeps push disabled for flag value "%s"',
    (value: string | undefined) => {
      expect(isPushNotificationsEnabled(value)).toBe(false);
    },
  );
});

describe('resolvePushNotificationPlatform', () => {
  it('maps react-native platform identifiers onto the backend enum', () => {
    expect(resolvePushNotificationPlatform('android')).toBe(PushNotificationPlatform.ANDROID);
    expect(resolvePushNotificationPlatform('ios')).toBe(PushNotificationPlatform.IOS);
    expect(resolvePushNotificationPlatform('web')).toBe(PushNotificationPlatform.WEB);
    expect(resolvePushNotificationPlatform('windows')).toBe(PushNotificationPlatform.WEB);
  });
});

describe('bootstrapPushNotifications', () => {
  it('returns a noop cleanup without initializing when the push flag is off', async () => {
    const initializeRuntime = createInitializeRuntimeMock();

    const cleanup = await bootstrapPushNotifications({
      enabledEnvValue: '0',
      initializeRuntime,
      readPersistedUserId: (): string | null => 'user-1',
    });

    expect(initializeRuntime).not.toHaveBeenCalled();
    expect(cleanup).not.toThrow();
  });

  it('returns a noop cleanup without initializing when no user id is persisted', async () => {
    const initializeRuntime = createInitializeRuntimeMock();

    const cleanup = await bootstrapPushNotifications({
      enabledEnvValue: 'true',
      initializeRuntime,
      readPersistedUserId: (): string | null => null,
    });

    expect(initializeRuntime).not.toHaveBeenCalled();
    expect(cleanup).not.toThrow();
  });

  it('initializes the FCM runtime with the persisted user and resolved platform', async () => {
    const adapter = createAdapterMock();
    const notificationsApiClient = createNotificationsApiMock();
    const runtimeCleanup = jest.fn<void, []>();
    const initializeRuntime = createInitializeRuntimeMock(runtimeCleanup);

    const cleanup = await bootstrapPushNotifications({
      adapter,
      enabledEnvValue: 'true',
      initializeRuntime,
      notificationsApiClient,
      platformOs: 'android',
      readPersistedUserId: (): string | null => 'user-7',
    });

    expect(initializeRuntime).toHaveBeenCalledTimes(1);
    expect(initializeRuntime).toHaveBeenCalledWith({
      adapter,
      notificationsApi: notificationsApiClient,
      platform: PushNotificationPlatform.ANDROID,
      userId: 'user-7',
    });

    cleanup();
    expect(runtimeCleanup).toHaveBeenCalledTimes(1);
  });
});

/**
 * Creates one initializeFcmRuntime mock resolving to the provided cleanup callback.
 */
function createInitializeRuntimeMock(
  cleanup: () => void = (): void => {
    return;
  },
): jest.Mock<Promise<() => void>, [InitializeFcmRuntimeInput]> {
  return jest.fn<Promise<() => void>, [InitializeFcmRuntimeInput]>().mockResolvedValue(cleanup);
}

/**
 * Creates one messaging adapter mock with granted permissions and a static token.
 */
function createAdapterMock(): FcmMessagingAdapter {
  return {
    getInitialNotification: jest.fn().mockResolvedValue(null),
    getToken: jest.fn().mockResolvedValue('token-1'),
    onMessage: jest.fn().mockReturnValue((): void => {
      return;
    }),
    onNotificationOpenedApp: jest.fn().mockReturnValue((): void => {
      return;
    }),
    onTokenRefresh: jest.fn().mockReturnValue((): void => {
      return;
    }),
    requestPermission: jest.fn().mockResolvedValue(true),
  };
}

/**
 * Creates one notifications API mock for push-token registration assertions.
 */
function createNotificationsApiMock(): NotificationsApi {
  return {
    registerPushToken: jest.fn().mockResolvedValue(undefined),
    unregisterPushToken: jest.fn().mockResolvedValue(undefined),
  };
}
