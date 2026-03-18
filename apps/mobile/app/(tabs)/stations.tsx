import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const StationsScreen = lazy(() => {
  return import('../../src/features/stations/stations-screen').then((module) => {
    return { default: module.StationsScreen };
  });
});

/**
 * Mounts the stations screen inside the tabs route group with lazy loading.
 */
export default function StationsRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <StationsScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
