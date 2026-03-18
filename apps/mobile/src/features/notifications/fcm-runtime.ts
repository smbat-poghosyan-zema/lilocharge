import { PushNotificationPlatform } from '@lilocharge/shared-types';

import {
  handleIncomingFcmMessage,
  type FcmEventHandlers,
  type FcmRemoteMessage,
} from './fcm-handlers';
import type { NotificationsApi } from './notifications-api';

/** Adapter contract bridging native/firebase messaging SDK methods to platform-agnostic FCM runtime logic. */
export interface FcmMessagingAdapter {
  getInitialNotification(): Promise<FcmRemoteMessage | null>;
  getToken(): Promise<string>;
  onMessage(listener: (message: FcmRemoteMessage) => void): () => void;
  onNotificationOpenedApp(listener: (message: FcmRemoteMessage) => void): () => void;
  onTokenRefresh(listener: (token: string) => void): () => void;
  requestPermission(): Promise<boolean>;
}

/** Input used to initialize mobile FCM runtime handlers and push-token registration flow. */
export interface InitializeFcmRuntimeInput extends FcmEventHandlers {
  readonly adapter: FcmMessagingAdapter;
  readonly notificationsApi: NotificationsApi;
  readonly platform: PushNotificationPlatform;
  readonly userId: string | null;
}

/**
 * Initializes mobile FCM listeners, registers current/refresh tokens, and returns one cleanup callback.
 */
export async function initializeFcmRuntime(input: InitializeFcmRuntimeInput): Promise<() => void> {
  const normalizedUserId = normalizeUserId(input.userId);

  if (normalizedUserId === null) {
    return (): void => {
      return;
    };
  }

  const granted = await input.adapter.requestPermission();
  if (!granted) {
    return (): void => {
      return;
    };
  }

  await registerTokenIfPresent(
    input.notificationsApi,
    normalizedUserId,
    input.platform,
    await input.adapter.getToken(),
  );

  const onRemoteMessage = (message: FcmRemoteMessage): void => {
    handleIncomingFcmMessage(message, input);
  };

  const unsubscribeForeground = input.adapter.onMessage(onRemoteMessage);
  const unsubscribeOpenedApp = input.adapter.onNotificationOpenedApp(onRemoteMessage);
  const unsubscribeTokenRefresh = input.adapter.onTokenRefresh((token: string) => {
    void registerTokenIfPresent(input.notificationsApi, normalizedUserId, input.platform, token);
  });

  const initialNotification = await input.adapter.getInitialNotification();
  if (initialNotification !== null) {
    onRemoteMessage(initialNotification);
  }

  return (): void => {
    unsubscribeForeground();
    unsubscribeOpenedApp();
    unsubscribeTokenRefresh();
  };
}

/** Normalizes and validates optional user ids used to scope token registration calls. */
function normalizeUserId(userId: string | null): string | null {
  if (userId === null) {
    return null;
  }

  const normalized = userId.trim();
  return normalized.length > 0 ? normalized : null;
}

/** Registers one token when present and non-empty, skipping silently for blank values. */
async function registerTokenIfPresent(
  notificationsApi: NotificationsApi,
  userId: string,
  platform: PushNotificationPlatform,
  token: string,
): Promise<void> {
  const normalizedToken = token.trim();

  if (normalizedToken.length === 0) {
    return;
  }

  await notificationsApi.registerPushToken(userId, {
    platform,
    token: normalizedToken,
  });
}

export type { FcmRemoteMessage } from './fcm-handlers';
