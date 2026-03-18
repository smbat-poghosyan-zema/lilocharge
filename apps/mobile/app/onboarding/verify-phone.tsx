import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const VerifyPhoneScreen = lazy(() => {
  return import('../../src/features/onboarding/verify-phone-screen').then((module) => {
    return { default: module.VerifyPhoneScreen };
  });
});

/**
 * Mounts the phone verification onboarding screen with lazy loading.
 */
export default function VerifyPhoneRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <VerifyPhoneScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
