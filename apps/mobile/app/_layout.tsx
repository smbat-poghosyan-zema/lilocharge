import { Stack } from 'expo-router';
import { I18nextProvider } from 'react-i18next';

import { OnboardingSessionProvider } from '../src/features/onboarding/onboarding-session';
import i18n from '../src/i18n/i18n';

/**
 * Configures the root app stack for file-based Expo Router navigation.
 */
export default function RootLayout(): JSX.Element {
  return (
    <I18nextProvider i18n={i18n}>
      <OnboardingSessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </OnboardingSessionProvider>
    </I18nextProvider>
  );
}
