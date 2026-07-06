import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '../../i18n/i18n';
import type { FcmMessagingAdapter, FcmRemoteMessage } from './fcm-runtime';

/** Android notification channel id used for LiloCharge session/payment pushes. */
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'default';

/** Options for creating one expo-notifications backed messaging adapter. */
export interface CreateExpoNotificationsAdapterOptions {
  /** Human-readable Android channel name shown in system notification settings. */
  readonly androidChannelName?: string;
}

/**
 * Creates one {@link FcmMessagingAdapter} implementation backed by expo-notifications.
 *
 * Token strategy: the backend delivers pushes directly through firebase-admin, so this
 * adapter registers the native device push token from `getDevicePushTokenAsync` (an FCM
 * registration token on Android, an APNs token on iOS). `getExpoPushTokenAsync` is
 * intentionally NOT used because Expo push-service tokens (`ExponentPushToken[...]`) are
 * only routable through Expo's push gateway and would be rejected by firebase-admin.
 */
export function createExpoNotificationsAdapter(
  options: CreateExpoNotificationsAdapterOptions = {},
): FcmMessagingAdapter {
  return {
    getInitialNotification: async (): Promise<FcmRemoteMessage | null> => {
      const response = await Notifications.getLastNotificationResponseAsync();

      return response === null ? null : toFcmRemoteMessage(response.notification);
    },

    getToken: async (): Promise<string> => {
      const deviceToken = await Notifications.getDevicePushTokenAsync();

      // Native platforms return the raw FCM/APNs token string; web returns an
      // object-shaped VAPID registration which the backend does not support.
      return typeof deviceToken.data === 'string' ? deviceToken.data : '';
    },

    onMessage: (listener: (message: FcmRemoteMessage) => void): (() => void) => {
      const subscription = Notifications.addNotificationReceivedListener(
        (notification: Notifications.Notification): void => {
          listener(toFcmRemoteMessage(notification));
        },
      );

      return (): void => {
        subscription.remove();
      };
    },

    onNotificationOpenedApp: (listener: (message: FcmRemoteMessage) => void): (() => void) => {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        (response: Notifications.NotificationResponse): void => {
          listener(toFcmRemoteMessage(response.notification));
        },
      );

      return (): void => {
        subscription.remove();
      };
    },

    onTokenRefresh: (listener: (token: string) => void): (() => void) => {
      const subscription = Notifications.addPushTokenListener(
        (deviceToken: Notifications.DevicePushToken): void => {
          if (typeof deviceToken.data === 'string') {
            listener(deviceToken.data);
          }
        },
      );

      return (): void => {
        subscription.remove();
      };
    },

    requestPermission: async (): Promise<boolean> => {
      await ensureAndroidNotificationChannel(options.androidChannelName);

      const currentPermission = await Notifications.getPermissionsAsync();
      if (currentPermission.granted) {
        return true;
      }

      if (!currentPermission.canAskAgain) {
        return false;
      }

      const requestedPermission = await Notifications.requestPermissionsAsync();

      return requestedPermission.granted;
    },
  };
}

/**
 * Ensures the default Android notification channel exists before permissions/tokens are
 * requested; Android 8+ silently drops notifications posted without a channel.
 */
async function ensureAndroidNotificationChannel(channelName: string | undefined): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: channelName ?? i18n.t('notifications.androidChannelName'),
  });
}

/**
 * Maps one expo notification onto the lightweight FCM remote-message contract by merging
 * the Android FCM trigger data payload (when present) with the notification content data.
 */
function toFcmRemoteMessage(notification: Notifications.Notification): FcmRemoteMessage {
  return {
    data: {
      ...extractFirebaseTriggerData(notification),
      ...normalizeDataRecord(notification.request.content.data),
    },
  };
}

/**
 * Extracts the raw FCM data payload from an Android remote-message trigger when present.
 */
function extractFirebaseTriggerData(
  notification: Notifications.Notification,
): Record<string, string | undefined> {
  const trigger = notification.request.trigger as {
    readonly remoteMessage?: { readonly data?: Record<string, string> | null } | null;
  } | null;

  return normalizeDataRecord(trigger?.remoteMessage?.data ?? undefined);
}

/**
 * Normalizes one loosely typed notification data record into string-valued entries.
 */
function normalizeDataRecord(
  data: Record<string, unknown> | null | undefined,
): Record<string, string | undefined> {
  if (data === null || data === undefined) {
    return {};
  }

  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      normalized[key] = value;
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = String(value);
    }
  }

  return normalized;
}
