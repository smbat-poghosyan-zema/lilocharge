import { ConnectorType } from '@lilocharge/shared-types';
import { render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import {
  OnboardingSessionProvider,
  useOnboardingSession,
  type PaymentGatewayOption,
} from './onboarding-session';
import { createSessionStorage, type SessionStorage } from './session-storage';

const ACCESS_TOKEN_WITH_SUB = createAccessTokenWithSub('11111111-1111-1111-1111-111111111111');

/**
 * Builds an isolated in-memory session storage for provider persistence tests.
 */
function createInMemorySessionStorage(): SessionStorage {
  const valueByKey = new Map<string, string>();

  return createSessionStorage({
    delete: (key: string): void => {
      valueByKey.delete(key);
    },
    getString: (key: string): string | undefined => {
      return valueByKey.get(key);
    },
    set: (key: string, value: string): void => {
      valueByKey.set(key, value);
    },
  });
}

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

function StateReader(): JSX.Element {
  const { state } = useOnboardingSession();

  return (
    <Text testID="hydrated-state">
      {JSON.stringify({
        accessToken: state.tokenPair?.accessToken ?? null,
        isComplete: state.isComplete,
        refreshToken: state.tokenPair?.refreshToken ?? null,
        userId: state.userId,
      })}
    </Text>
  );
}

function ResetConsumer(): JSX.Element {
  const { resetOnboarding, state } = useOnboardingSession();

  useEffect(() => {
    resetOnboarding();
  }, []);

  return <Text testID="reset-state">{JSON.stringify({ isComplete: state.isComplete })}</Text>;
}

describe('OnboardingSessionProvider', () => {
  it('tracks onboarding lifecycle state updates', async () => {
    render(
      <OnboardingSessionProvider sessionStorage={createInMemorySessionStorage()}>
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

  it('persists tokens and completion to session storage', async () => {
    const sessionStorage = createInMemorySessionStorage();

    render(
      <OnboardingSessionProvider sessionStorage={sessionStorage}>
        <SessionConsumer />
      </OnboardingSessionProvider>,
    );

    await waitFor(() => {
      expect(sessionStorage.readSession()).toEqual({
        accessToken: ACCESS_TOKEN_WITH_SUB,
        onboardingComplete: true,
        refreshToken: 'refresh-token',
        userId: '11111111-1111-1111-1111-111111111111',
      });
    });
  });

  it('hydrates initial state from persisted session storage', () => {
    const sessionStorage = createInMemorySessionStorage();
    sessionStorage.setTokenPair(
      { accessToken: ACCESS_TOKEN_WITH_SUB, refreshToken: 'refresh-token' },
      '11111111-1111-1111-1111-111111111111',
    );
    sessionStorage.setOnboardingComplete(true);

    render(
      <OnboardingSessionProvider sessionStorage={sessionStorage}>
        <StateReader />
      </OnboardingSessionProvider>,
    );

    expect(screen.getByTestId('hydrated-state')).toHaveTextContent(
      JSON.stringify({
        accessToken: ACCESS_TOKEN_WITH_SUB,
        isComplete: true,
        refreshToken: 'refresh-token',
        userId: '11111111-1111-1111-1111-111111111111',
      }),
    );
  });

  it('clears persisted session when onboarding is reset', async () => {
    const sessionStorage = createInMemorySessionStorage();
    sessionStorage.setTokenPair(
      { accessToken: ACCESS_TOKEN_WITH_SUB, refreshToken: 'refresh-token' },
      '11111111-1111-1111-1111-111111111111',
    );
    sessionStorage.setOnboardingComplete(true);

    render(
      <OnboardingSessionProvider sessionStorage={sessionStorage}>
        <ResetConsumer />
      </OnboardingSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('reset-state')).toHaveTextContent(
        JSON.stringify({ isComplete: false }),
      );
    });

    expect(sessionStorage.readSession()).toEqual({
      accessToken: null,
      onboardingComplete: false,
      refreshToken: null,
      userId: null,
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
