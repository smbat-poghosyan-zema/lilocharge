import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const ProfileScreen = lazy(() => {
  return import('../../src/features/profile/profile-screen').then((module) => {
    return { default: module.ProfileScreen };
  });
});

/**
 * Mounts the profile screen inside the tabs route group with lazy loading.
 */
export default function ProfileRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <ProfileScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
