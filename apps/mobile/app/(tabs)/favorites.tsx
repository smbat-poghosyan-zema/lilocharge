import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const FavoritesScreen = lazy(() => {
  return import('../../src/features/favorites/favorites-screen').then((module) => {
    return { default: module.FavoritesScreen };
  });
});

/**
 * Mounts the favorites screen inside the tabs route group with lazy loading.
 */
export default function FavoritesRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <FavoritesScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
