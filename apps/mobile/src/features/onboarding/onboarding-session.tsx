import type {
  AuthTokenPairResponse,
  SupportedLanguageCode,
  VehicleResponse,
} from '@lilocharge/shared-types';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { extractUserIdFromAccessToken } from './auth-token';

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
  completeOnboarding(): void;
  resetOnboarding(): void;
  selectPaymentGateway(gateway: PaymentGatewayOption): void;
  setAuthTokenPair(tokenPair: AuthTokenPairResponse): void;
  setRegistrationDraft(draft: RegistrationDraft): void;
  setVehicle(vehicle: VehicleResponse): void;
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

/**
 * Provides shared in-memory onboarding state to onboarding route screens.
 */
export function OnboardingSessionProvider({ children }: PropsWithChildren): JSX.Element {
  const [state, setState] = useState<OnboardingSessionState>(INITIAL_ONBOARDING_STATE);

  const value = useMemo<OnboardingSessionContextValue>(() => {
    return {
      completeOnboarding: (): void => {
        setState((previousState) => ({
          ...previousState,
          isComplete: true,
        }));
      },

      resetOnboarding: (): void => {
        setState(INITIAL_ONBOARDING_STATE);
      },

      selectPaymentGateway: (gateway: PaymentGatewayOption): void => {
        setState((previousState) => ({
          ...previousState,
          selectedPaymentGateway: gateway,
        }));
      },

      setAuthTokenPair: (tokenPair: AuthTokenPairResponse): void => {
        setState((previousState) => ({
          ...previousState,
          tokenPair,
          userId: extractUserIdFromAccessToken(tokenPair.accessToken),
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
  }, [state]);

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
