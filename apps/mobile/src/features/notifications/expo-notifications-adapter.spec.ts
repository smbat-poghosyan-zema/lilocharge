import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { FcmRemoteMessage } from './fcm-runtime';
import {
  ANDROID_NOTIFICATION_CHANNEL_ID,
  createExpoNotificationsAdapter,
} from './expo-notifications-adapter';

const getPermissionsAsyncMock = jest.mocked(Notifications.getPermissionsAsync);
const requestPermissionsAsyncMock = jest.mocked(Notifications.requestPermissionsAsync);
const getDevicePushTokenAsyncMock = jest.mocked(Notifications.getDevicePushTokenAsync);
const addNotificationReceivedListenerMock = jest.mocked(
  Notifications.addNotificationReceivedListener,
);
const addNotificationResponseReceivedListenerMock = jest.mocked(
  Notifications.addNotificationResponseReceivedListener,
);
const addPushTokenListenerMock = jest.mocked(Notifications.addPushTokenListener);
const getLastNotificationResponseAsyncMock = jest.mocked(
  Notifications.getLastNotificationResponseAsync,
);
const setNotificationChannelAsyncMock = jest.mocked(Notifications.setNotificationChannelAsync);

describe('createExpoNotificationsAdapter', () => {
  beforeEach(() => {
    getPermissionsAsyncMock.mockResolvedValue(buildPermissionStatus(false, true));
    requestPermissionsAsyncMock.mockResolvedValue(buildPermissionStatus(false, false));
    getDevicePushTokenAsyncMock.mockResolvedValue({
      data: 'fcm-device-token-1',
      type: 'android',
    });
    getLastNotificationResponseAsyncMock.mockResolvedValue(null);
    setNotificationChannelAsyncMock.mockResolvedValue(null);
    addNotificationReceivedListenerMock.mockReturnValue({ remove: jest.fn() });
    addNotificationResponseReceivedListenerMock.mockReturnValue({ remove: jest.fn() });
    addPushTokenListenerMock.mockReturnValue({ remove: jest.fn() });
  });

  describe('requestPermission', () => {
    it('returns true without prompting when permission is already granted', async () => {
      getPermissionsAsyncMock.mockResolvedValue(buildPermissionStatus(true, false));

      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.requestPermission()).resolves.toBe(true);
      expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();
    });

    it('prompts for permission and returns the prompt result when undetermined', async () => {
      getPermissionsAsyncMock.mockResolvedValue(buildPermissionStatus(false, true));
      requestPermissionsAsyncMock.mockResolvedValue(buildPermissionStatus(true, false));

      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.requestPermission()).resolves.toBe(true);
      expect(requestPermissionsAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('returns false without prompting when the user can no longer be asked', async () => {
      getPermissionsAsyncMock.mockResolvedValue(buildPermissionStatus(false, false));

      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.requestPermission()).resolves.toBe(false);
      expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();
    });

    it('creates the default Android notification channel on android platforms', async () => {
      const replacedPlatform = jest.replaceProperty(
        Platform as { OS: typeof Platform.OS },
        'OS',
        'android',
      );

      try {
        const adapter = createExpoNotificationsAdapter({ androidChannelName: 'LiloCharge' });

        await adapter.requestPermission();

        expect(setNotificationChannelAsyncMock).toHaveBeenCalledWith(
          ANDROID_NOTIFICATION_CHANNEL_ID,
          expect.objectContaining({ name: 'LiloCharge' }),
        );
      } finally {
        replacedPlatform.restore();
      }
    });

    it('skips Android channel setup on non-android platforms', async () => {
      const replacedPlatform = jest.replaceProperty(
        Platform as { OS: typeof Platform.OS },
        'OS',
        'ios',
      );

      try {
        const adapter = createExpoNotificationsAdapter();

        await adapter.requestPermission();

        expect(setNotificationChannelAsyncMock).not.toHaveBeenCalled();
      } finally {
        replacedPlatform.restore();
      }
    });
  });

  describe('getToken', () => {
    it('returns the native FCM device token instead of an Expo push token', async () => {
      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.getToken()).resolves.toBe('fcm-device-token-1');
      expect(getDevicePushTokenAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('returns an empty token for non-string device token payloads', async () => {
      getDevicePushTokenAsyncMock.mockResolvedValue({
        data: { endpoint: 'https://push.example', keys: { auth: 'a', p256dh: 'p' } },
        type: 'web',
      });

      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.getToken()).resolves.toBe('');
    });
  });

  describe('message listeners', () => {
    it('maps foreground notifications onto FCM remote messages and supports unsubscribe', () => {
      let capturedListener: ((notification: Notifications.Notification) => void) | null = null;
      const removeSubscription = jest.fn();
      addNotificationReceivedListenerMock.mockImplementation(
        (listener: (notification: Notifications.Notification) => void) => {
          capturedListener = listener;
          return { remove: removeSubscription };
        },
      );
      const received: FcmRemoteMessage[] = [];

      const adapter = createExpoNotificationsAdapter();
      const unsubscribe = adapter.onMessage((message: FcmRemoteMessage) => {
        received.push(message);
      });

      if (capturedListener === null) {
        throw new Error('Expected foreground notification listener to be registered');
      }

      (capturedListener as (notification: Notifications.Notification) => void)(
        buildNotification({
          eventType: 'SESSION_STARTED',
          sessionId: 'session-1',
          totalCostAmd: 2100,
          userId: 'user-1',
        }),
      );

      expect(received).toEqual([
        {
          data: {
            eventType: 'SESSION_STARTED',
            sessionId: 'session-1',
            totalCostAmd: '2100',
            userId: 'user-1',
          },
        },
      ]);

      unsubscribe();
      expect(removeSubscription).toHaveBeenCalledTimes(1);
    });

    it('maps tapped notification responses onto FCM remote messages', () => {
      let capturedListener: ((response: Notifications.NotificationResponse) => void) | null = null;
      addNotificationResponseReceivedListenerMock.mockImplementation(
        (listener: (response: Notifications.NotificationResponse) => void) => {
          capturedListener = listener;
          return { remove: jest.fn() };
        },
      );
      const received: FcmRemoteMessage[] = [];

      const adapter = createExpoNotificationsAdapter();
      adapter.onNotificationOpenedApp((message: FcmRemoteMessage) => {
        received.push(message);
      });

      if (capturedListener === null) {
        throw new Error('Expected notification response listener to be registered');
      }

      (capturedListener as (response: Notifications.NotificationResponse) => void)(
        buildNotificationResponse({
          eventType: 'PAYMENT_SUCCEEDED',
          sessionId: 'session-2',
          userId: 'user-1',
        }),
      );

      expect(received).toEqual([
        {
          data: {
            eventType: 'PAYMENT_SUCCEEDED',
            sessionId: 'session-2',
            userId: 'user-1',
          },
        },
      ]);
    });

    it('merges Android FCM trigger data with notification content data', () => {
      let capturedListener: ((notification: Notifications.Notification) => void) | null = null;
      addNotificationReceivedListenerMock.mockImplementation(
        (listener: (notification: Notifications.Notification) => void) => {
          capturedListener = listener;
          return { remove: jest.fn() };
        },
      );
      const received: FcmRemoteMessage[] = [];

      const adapter = createExpoNotificationsAdapter();
      adapter.onMessage((message: FcmRemoteMessage) => {
        received.push(message);
      });

      if (capturedListener === null) {
        throw new Error('Expected foreground notification listener to be registered');
      }

      const notification = buildNotification({ sessionId: 'session-3' });
      const notificationWithTrigger: Notifications.Notification = {
        ...notification,
        request: {
          ...notification.request,
          trigger: {
            remoteMessage: {
              data: { eventType: 'SESSION_COMPLETED', userId: 'user-9' },
            },
            type: 'push',
          } as unknown as Notifications.NotificationTrigger,
        },
      };

      (capturedListener as (notification: Notifications.Notification) => void)(
        notificationWithTrigger,
      );

      expect(received).toEqual([
        {
          data: {
            eventType: 'SESSION_COMPLETED',
            sessionId: 'session-3',
            userId: 'user-9',
          },
        },
      ]);
    });
  });

  describe('getInitialNotification', () => {
    it('returns null when no notification response was recorded', async () => {
      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.getInitialNotification()).resolves.toBeNull();
    });

    it('maps the last recorded notification response when present', async () => {
      getLastNotificationResponseAsyncMock.mockResolvedValue(
        buildNotificationResponse({
          eventType: 'SESSION_COMPLETED',
          sessionId: 'session-4',
          userId: 'user-1',
        }),
      );

      const adapter = createExpoNotificationsAdapter();

      await expect(adapter.getInitialNotification()).resolves.toEqual({
        data: {
          eventType: 'SESSION_COMPLETED',
          sessionId: 'session-4',
          userId: 'user-1',
        },
      });
    });
  });

  describe('onTokenRefresh', () => {
    it('forwards refreshed string device tokens and supports unsubscribe', () => {
      let capturedListener: ((token: Notifications.DevicePushToken) => void) | null = null;
      const removeSubscription = jest.fn();
      addPushTokenListenerMock.mockImplementation(
        (listener: (token: Notifications.DevicePushToken) => void) => {
          capturedListener = listener;
          return { remove: removeSubscription };
        },
      );
      const receivedTokens: string[] = [];

      const adapter = createExpoNotificationsAdapter();
      const unsubscribe = adapter.onTokenRefresh((token: string) => {
        receivedTokens.push(token);
      });

      if (capturedListener === null) {
        throw new Error('Expected push token listener to be registered');
      }

      (capturedListener as (token: Notifications.DevicePushToken) => void)({
        data: 'fcm-device-token-2',
        type: 'android',
      });
      (capturedListener as (token: Notifications.DevicePushToken) => void)({
        data: { endpoint: 'https://push.example', keys: { auth: 'a', p256dh: 'p' } },
        type: 'web',
      });

      expect(receivedTokens).toEqual(['fcm-device-token-2']);

      unsubscribe();
      expect(removeSubscription).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Builds one notification permissions status fixture with the provided grant flags.
 */
function buildPermissionStatus(
  granted: boolean,
  canAskAgain: boolean,
): Notifications.NotificationPermissionsStatus {
  return {
    canAskAgain,
    expires: 'never',
    granted,
    status: granted ? 'granted' : 'undetermined',
  } as Notifications.NotificationPermissionsStatus;
}

/**
 * Builds one expo notification fixture carrying the provided data payload.
 */
function buildNotification(data: Record<string, unknown>): Notifications.Notification {
  return {
    date: Date.now(),
    request: {
      content: {
        data,
      },
      identifier: 'notification-1',
      trigger: null,
    },
  } as unknown as Notifications.Notification;
}

/**
 * Builds one expo notification response fixture carrying the provided data payload.
 */
function buildNotificationResponse(
  data: Record<string, unknown>,
): Notifications.NotificationResponse {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: buildNotification(data),
  } as Notifications.NotificationResponse;
}
