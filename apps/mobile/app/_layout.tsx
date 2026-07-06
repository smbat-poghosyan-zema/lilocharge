import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import { OfflineBanner } from '../src/components/offline-banner';
import { bootstrapPushNotifications } from '../src/features/notifications/push-bootstrap';
import { OnboardingSessionProvider } from '../src/features/onboarding/onboarding-session';
import i18n from '../src/i18n/i18n';

/**
 * Configures the root app stack for file-based Expo Router navigation.
 */
export default function RootLayout(): JSX.Element {
  useEffect(() => {
    let isUnmounted = false;
    let cleanupPushRuntime: (() => void) | null = null;

    // Fire-and-forget: push bootstrap is guarded by EXPO_PUBLIC_PUSH_ENABLED and a
    // persisted user id, and must never block or crash app start.
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
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <OnboardingSessionProvider>
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }} />
      </OnboardingSessionProvider>
    </I18nextProvider>
  );
}
