import { PushNotificationPlatform } from '@lilocharge/shared-types';
import { Platform } from 'react-native';

import { onboardingSessionStorage } from '../onboarding/session-storage';
import { createExpoNotificationsAdapter } from './expo-notifications-adapter';
import { initializeFcmRuntime, type FcmMessagingAdapter } from './fcm-runtime';
import { notificationsApi, type NotificationsApi } from './notifications-api';

/** Overridable dependencies used by the push bootstrap flow (primarily for tests). */
export interface BootstrapPushNotificationsOptions {
  readonly adapter?: FcmMessagingAdapter;
  readonly enabledEnvValue?: string;
  readonly initializeRuntime?: typeof initializeFcmRuntime;
  readonly notificationsApiClient?: NotificationsApi;
  readonly platformOs?: string;
  readonly readPersistedUserId?: () => string | null;
}

const NOOP_CLEANUP = (): void => {
  return;
};

/**
 * Resolves whether push notifications are enabled via the EXPO_PUBLIC_PUSH_ENABLED flag.
 *
 * Defaults to disabled so Expo Go and local development builds never trigger permission
 * prompts or device-token registration unless explicitly opted in.
 */
export function isPushNotificationsEnabled(envValue: string | undefined): boolean {
  const normalized = envValue?.trim().toLowerCase();

  return normalized === '1' || normalized === 'true';
}

/**
 * Maps one React Native platform identifier onto the backend push-platform enum.
 */
export function resolvePushNotificationPlatform(platformOs: string): PushNotificationPlatform {
  if (platformOs === 'android') {
    return PushNotificationPlatform.ANDROID;
  }

  if (platformOs === 'ios') {
    return PushNotificationPlatform.IOS;
  }

  return PushNotificationPlatform.WEB;
}

/**
 * Bootstraps the FCM push runtime for the persisted user, returning one cleanup callback.
 *
 * The flow no-ops (returning a noop cleanup) when the EXPO_PUBLIC_PUSH_ENABLED flag is off
 * or when no authenticated user id has been persisted yet.
 */
export async function bootstrapPushNotifications(
  options: BootstrapPushNotificationsOptions = {},
): Promise<() => void> {
  // Expo statically inlines EXPO_PUBLIC_* variables at bundle time, so the literal
  // `process.env.EXPO_PUBLIC_PUSH_ENABLED` expression must appear here.
  const enabledEnvValue = options.enabledEnvValue ?? process.env.EXPO_PUBLIC_PUSH_ENABLED;

  if (!isPushNotificationsEnabled(enabledEnvValue)) {
    return NOOP_CLEANUP;
  }

  const readPersistedUserId = options.readPersistedUserId ?? readDefaultPersistedUserId;
  const userId = readPersistedUserId();

  if (userId === null) {
    return NOOP_CLEANUP;
  }

  const initializeRuntime = options.initializeRuntime ?? initializeFcmRuntime;

  return initializeRuntime({
    adapter: options.adapter ?? createExpoNotificationsAdapter(),
    notificationsApi: options.notificationsApiClient ?? notificationsApi,
    platform: resolvePushNotificationPlatform(options.platformOs ?? Platform.OS),
    userId,
  });
}

/** Overridable dependencies used by the push-token unregistration flow. */
export interface UnregisterPushNotificationsOptions {
  readonly adapter?: Pick<FcmMessagingAdapter, 'getToken'>;
  readonly enabledEnvValue?: string;
  readonly notificationsApiClient?: Pick<NotificationsApi, 'unregisterPushToken'>;
  readonly readPersistedUserId?: () => string | null;
  readonly userId?: string | null;
}

/**
 * Unregisters the current device push token for the (still-authenticated) user.
 *
 * Called on logout before the session is cleared so the backend stops targeting
 * the device. No-ops (never throws) when push is disabled, no user is known, or
 * the device token/network is unavailable — token removal must never block or
 * fail logout.
 */
export async function unregisterPushNotifications(
  options: UnregisterPushNotificationsOptions = {},
): Promise<void> {
  // Expo statically inlines EXPO_PUBLIC_* variables at bundle time.
  const enabledEnvValue = options.enabledEnvValue ?? process.env.EXPO_PUBLIC_PUSH_ENABLED;

  if (!isPushNotificationsEnabled(enabledEnvValue)) {
    return;
  }

  const userId = options.userId ?? (options.readPersistedUserId ?? readDefaultPersistedUserId)();

  if (userId === null) {
    return;
  }

  try {
    const adapter = options.adapter ?? createExpoNotificationsAdapter();
    const notificationsApiClient = options.notificationsApiClient ?? notificationsApi;
    const token = await adapter.getToken();

    if (token.length === 0) {
      return;
    }

    await notificationsApiClient.unregisterPushToken(userId, { token });
  } catch {
    // Best-effort: a failed unregistration must never block logout.
  }
}

/**
 * Reads the persisted onboarding user id used to scope push-token registration.
 */
function readDefaultPersistedUserId(): string | null {
  return onboardingSessionStorage.readSession().userId;
}
