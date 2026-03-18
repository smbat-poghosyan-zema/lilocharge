import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const RegistrationScreen = lazy(() => {
  return import('../../src/features/onboarding/registration-screen').then((module) => {
    return { default: module.RegistrationScreen };
  });
});

/**
 * Mounts the registration onboarding screen with lazy loading.
 */
export default function RegisterRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <RegistrationScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
