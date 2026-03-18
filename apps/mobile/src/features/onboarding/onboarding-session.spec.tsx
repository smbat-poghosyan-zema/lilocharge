import { ConnectorType } from '@lilocharge/shared-types';
import { render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import {
  OnboardingSessionProvider,
  useOnboardingSession,
  type PaymentGatewayOption,
} from './onboarding-session';

const ACCESS_TOKEN_WITH_SUB = createAccessTokenWithSub('11111111-1111-1111-1111-111111111111');

function SessionConsumer(): JSX.Element {
  const onboardingSession = useOnboardingSession();

  useEffect(() => {
    onboardingSession.setRegistrationDraft({
      displayName: 'Անի Սարգսյան',
      email: 'ani@example.com',
      password: 'Password123!',
      phone: '+37477123456',
    });
    onboardingSession.setAuthTokenPair({
      accessToken: ACCESS_TOKEN_WITH_SUB,
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
    });
    onboardingSession.setVehicle({
      batteryCapacity: 64,
      connectorType: ConnectorType.CCS,
      createdAt: '2026-02-17T00:00:00.000Z',
      id: 'vehicle-id',
      make: 'Kia',
      maxChargePower: 240,
      model: 'EV6',
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: '11111111-1111-1111-1111-111111111111',
      year: 2024,
    });
    onboardingSession.selectPaymentGateway('ARCA');
    onboardingSession.completeOnboarding();
  }, []);

  return (
    <Text testID="session-state">
      {JSON.stringify({
        isComplete: onboardingSession.state.isComplete,
        paymentGateway: onboardingSession.state.selectedPaymentGateway,
        phone: onboardingSession.state.registrationDraft?.phone ?? null,
        userId: onboardingSession.state.userId ?? null,
      })}
    </Text>
  );
}

describe('OnboardingSessionProvider', () => {
  it('tracks onboarding lifecycle state updates', async () => {
    render(
      <OnboardingSessionProvider>
        <SessionConsumer />
      </OnboardingSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('session-state')).toHaveTextContent(
        JSON.stringify({
          isComplete: true,
          paymentGateway: 'ARCA' as PaymentGatewayOption,
          phone: '+37477123456',
          userId: '11111111-1111-1111-1111-111111111111',
        }),
      );
    });
  });
});

/**
 * Creates a simple unsigned JWT for token payload decoding tests.
 */
function createAccessTokenWithSub(userId: string): string {
  const header = base64UrlEncode('{"alg":"none","typ":"JWT"}');
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: 1900000000,
      sub: userId,
      tokenType: 'access',
    } satisfies { readonly exp: number; readonly sub: string; readonly tokenType: string }),
  );

  return `${header}.${payload}.signature`;
}

/**
 * Encodes a UTF-8 string to a base64url token segment.
 */
function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
