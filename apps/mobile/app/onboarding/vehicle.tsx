import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const VehicleSetupScreen = lazy(() => {
  return import('../../src/features/onboarding/vehicle-setup-screen').then((module) => {
    return { default: module.VehicleSetupScreen };
  });
});

/**
 * Mounts the vehicle setup onboarding screen with lazy loading.
 */
export default function VehicleRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <VehicleSetupScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
