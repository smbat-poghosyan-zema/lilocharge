import { lazy, Suspense } from 'react';

import { LazyLoadErrorBoundary } from '../../src/components/lazy-load-error-boundary';
import { LazyLoadFallback } from '../../src/components/lazy-load-fallback';

const PaymentMethodScreen = lazy(() => {
  return import('../../src/features/onboarding/payment-method-screen').then((module) => {
    return { default: module.PaymentMethodScreen };
  });
});

/**
 * Mounts the payment method onboarding screen with lazy loading.
 */
export default function PaymentRoute(): JSX.Element {
  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <PaymentMethodScreen />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
