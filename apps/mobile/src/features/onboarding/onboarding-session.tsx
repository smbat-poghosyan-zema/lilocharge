import type {
  AuthTokenPairResponse,
  SupportedLanguageCode,
  VehicleResponse,
} from '@lilocharge/shared-types';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { extractUserIdFromAccessToken } from './auth-token';
import { onboardingSessionStorage, type SessionStorage } from './session-storage';

/**
 * Supported payment methods shown in onboarding payment setup.
 */
export type PaymentGatewayOption = 'APPLE_PAY' | 'ARCA' | 'GOOGLE_PAY' | 'IDRAM';

/**
 * Captures registration fields entered before OTP verification.
 */
export interface RegistrationDraft {
  readonly displayName: string;
  readonly email: string;
  readonly language?: SupportedLanguageCode;
  readonly password: string;
  readonly phone: string;
}

/**
 * Aggregated onboarding session state shared across onboarding screens.
 */
export interface OnboardingSessionState {
  readonly isComplete: boolean;
  readonly registrationDraft: RegistrationDraft | null;
  readonly selectedPaymentGateway: PaymentGatewayOption | null;
  readonly tokenPair: AuthTokenPairResponse | null;
  readonly userId: string | null;
  readonly vehicle: VehicleResponse | null;
}

/**
 * Context actions used by onboarding screens to mutate flow state.
 */
export interface OnboardingSessionActions {
  readonly completeOnboarding: () => void;
  readonly resetOnboarding: () => void;
  readonly selectPaymentGateway: (gateway: PaymentGatewayOption) => void;
  readonly setAuthTokenPair: (tokenPair: AuthTokenPairResponse) => void;
  readonly setRegistrationDraft: (draft: RegistrationDraft) => void;
  readonly setVehicle: (vehicle: VehicleResponse) => void;
}

/**
 * Context value consumed by onboarding screens and route guards.
 */
export interface OnboardingSessionContextValue extends OnboardingSessionActions {
  readonly state: OnboardingSessionState;
}

const INITIAL_ONBOARDING_STATE: OnboardingSessionState = {
  isComplete: false,
  registrationDraft: null,
  selectedPaymentGateway: null,
  tokenPair: null,
  userId: null,
  vehicle: null,
};

const OnboardingSessionContext = createContext<OnboardingSessionContextValue | null>(null);

interface OnboardingSessionProviderProps {
  readonly sessionStorage?: SessionStorage;
}

/**
 * Builds the initial onboarding state by hydrating persisted auth/session fields.
 */
function buildInitialOnboardingState(sessionStorage: SessionStorage): OnboardingSessionState {
  const persistedSession = sessionStorage.readSession();
  const hasTokenPair =
    persistedSession.accessToken !== null && persistedSession.refreshToken !== null;

  return {
    ...INITIAL_ONBOARDING_STATE,
    isComplete: persistedSession.onboardingComplete,
    tokenPair: hasTokenPair
      ? {
          accessToken: persistedSession.accessToken,
          refreshToken: persistedSession.refreshToken,
          tokenType: 'Bearer',
        }
      : null,
    userId: persistedSession.userId,
  };
}

/**
 * Provides shared onboarding state to onboarding route screens, hydrated from
 * and persisted to MMKV-backed session storage across cold starts.
 */
export function OnboardingSessionProvider({
  children,
  sessionStorage = onboardingSessionStorage,
}: PropsWithChildren<OnboardingSessionProviderProps>): JSX.Element {
  const [state, setState] = useState<OnboardingSessionState>(() => {
    return buildInitialOnboardingState(sessionStorage);
  });

  const value = useMemo<OnboardingSessionContextValue>(() => {
    return {
      completeOnboarding: (): void => {
        sessionStorage.setOnboardingComplete(true);
        setState((previousState) => ({
          ...previousState,
          isComplete: true,
        }));
      },

      resetOnboarding: (): void => {
        sessionStorage.clearSession();
        setState(INITIAL_ONBOARDING_STATE);
      },

      selectPaymentGateway: (gateway: PaymentGatewayOption): void => {
        setState((previousState) => ({
          ...previousState,
          selectedPaymentGateway: gateway,
        }));
      },

      setAuthTokenPair: (tokenPair: AuthTokenPairResponse): void => {
        const userId = extractUserIdFromAccessToken(tokenPair.accessToken);

        sessionStorage.setTokenPair(tokenPair, userId);
        setState((previousState) => ({
          ...previousState,
          tokenPair,
          userId,
        }));
      },

      setRegistrationDraft: (draft: RegistrationDraft): void => {
        setState((previousState) => ({
          ...previousState,
          registrationDraft: draft,
        }));
      },

      setVehicle: (vehicle: VehicleResponse): void => {
        setState((previousState) => ({
          ...previousState,
          vehicle,
        }));
      },

      state,
    };
  }, [sessionStorage, state]);

  return (
    <OnboardingSessionContext.Provider value={value}>{children}</OnboardingSessionContext.Provider>
  );
}

/**
 * Returns onboarding session state/actions from provider context.
 */
export function useOnboardingSession(): OnboardingSessionContextValue {
  const context = useContext(OnboardingSessionContext);

  if (context === null) {
    throw new Error('useOnboardingSession must be used within OnboardingSessionProvider');
  }

  return context;
}
