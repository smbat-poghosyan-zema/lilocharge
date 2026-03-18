import { Stack } from 'expo-router';

/**
 * Configures onboarding route stack navigation.
 */
export default function OnboardingLayout(): JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
