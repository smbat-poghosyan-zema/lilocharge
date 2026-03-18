import { Redirect } from 'expo-router';

import { useOnboardingSession } from '../src/features/onboarding/onboarding-session';

/**
 * Redirects the root route to onboarding or the primary tab navigator.
 */
export default function IndexRoute(): JSX.Element {
  const { state } = useOnboardingSession();

  return <Redirect href={state.isComplete ? '/(tabs)/stations' : '/onboarding/register'} />;
}
