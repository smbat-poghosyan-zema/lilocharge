import '../global.css';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import { OfflineBanner } from '../src/components/offline-banner';
import { bootstrapPushNotifications } from '../src/features/notifications/push-bootstrap';
import {
  OnboardingSessionProvider,
  useOnboardingSession,
} from '../src/features/onboarding/onboarding-session';
import i18n from '../src/i18n/i18n';

/**
 * Runs (and re-runs) the push-notification bootstrap in step with the session.
 *
 * Keyed on the authenticated user id so a fresh-install user who signs in
 * registers their push token immediately, rather than only after the next cold
 * start. Push bootstrap remains guarded by EXPO_PUBLIC_PUSH_ENABLED and no-ops
 * when no user id is persisted.
 */
function PushNotificationsLifecycle(): null {
  const { state } = useOnboardingSession();
  const userId = state.userId;

  useEffect(() => {
    let isUnmounted = false;
    let cleanupPushRuntime: (() => void) | null = null;

    bootstrapPushNotifications()
      .then((cleanup: () => void): void => {
        if (isUnmounted) {
          cleanup();
          return;
        }

        cleanupPushRuntime = cleanup;
      })
      .catch((error: unknown): void => {
        console.warn('Push notification bootstrap failed', error);
      });

    return (): void => {
      isUnmounted = true;
      cleanupPushRuntime?.();
    };
  }, [userId]);

  return null;
}

/**
 * Configures the root app stack for file-based Expo Router navigation.
 */
export default function RootLayout(): JSX.Element {
  return (
    <I18nextProvider i18n={i18n}>
      <OnboardingSessionProvider>
        <PushNotificationsLifecycle />
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }} />
      </OnboardingSessionProvider>
    </I18nextProvider>
  );
}
