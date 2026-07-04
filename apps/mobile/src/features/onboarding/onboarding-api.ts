import type {
  AuthTokenPairResponse,
  CreateVehicleRequest,
  ExchangeApplePayTokenRequest,
  ExchangeGooglePayTokenRequest,
  PaymentMethodResponse,
  PhoneOtpRequestResponse,
  SupportedLanguageCode,
  VehicleResponse,
} from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from './session-storage';

/**
 * Request body used when completing OTP verification and account registration.
 */
export interface VerifyPhoneOtpAndRegisterRequest {
  readonly code: string;
  readonly displayName: string;
  readonly email: string;
  readonly language?: SupportedLanguageCode;
  readonly password: string;
  readonly phone: string;
}

/**
 * Request body for email/password login.
 */
export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Typed onboarding API contract for registration and profile setup flow.
 */
export interface OnboardingApi {
  createVehicleProfile(userId: string, payload: CreateVehicleRequest): Promise<VehicleResponse>;
  exchangeApplePayToken(
    userId: string,
    payload: ExchangeApplePayTokenRequest,
  ): Promise<PaymentMethodResponse>;
  exchangeGooglePayToken(
    userId: string,
    payload: ExchangeGooglePayTokenRequest,
  ): Promise<PaymentMethodResponse>;
  login(payload: LoginCredentials): Promise<AuthTokenPairResponse>;
  requestPhoneOtp(payload: { readonly phone: string }): Promise<PhoneOtpRequestResponse>;
  verifyPhoneOtpAndRegister(
    payload: VerifyPhoneOtpAndRegisterRequest,
  ): Promise<AuthTokenPairResponse>;
}

/**
 * Creates onboarding API helpers backed by the shared typed ApiClient.
 */
export function createOnboardingApi(apiClient: ApiClient): OnboardingApi {
  return {
    createVehicleProfile: (
      userId: string,
      payload: CreateVehicleRequest,
    ): Promise<VehicleResponse> => {
      return apiClient.post<VehicleResponse, CreateVehicleRequest>(`/users/${userId}/vehicles`, {
        body: payload,
      });
    },

    exchangeApplePayToken: (
      userId: string,
      payload: ExchangeApplePayTokenRequest,
    ): Promise<PaymentMethodResponse> => {
      return apiClient.post<PaymentMethodResponse, ExchangeApplePayTokenRequest>(
        `/users/${userId}/payments/apple-pay/token-exchange`,
        {
          body: payload,
        },
      );
    },
    exchangeGooglePayToken: (
      userId: string,
      payload: ExchangeGooglePayTokenRequest,
    ): Promise<PaymentMethodResponse> => {
      return apiClient.post<PaymentMethodResponse, ExchangeGooglePayTokenRequest>(
        `/users/${userId}/payments/google-pay/token-exchange`,
        {
          body: payload,
        },
      );
    },

    login: (payload: LoginCredentials): Promise<AuthTokenPairResponse> => {
      return apiClient.post<AuthTokenPairResponse, LoginCredentials>('/auth/login', {
        body: payload,
      });
    },

    requestPhoneOtp: (payload: { readonly phone: string }): Promise<PhoneOtpRequestResponse> => {
      return apiClient.post<PhoneOtpRequestResponse, { readonly phone: string }>(
        '/auth/otp/request',
        {
          body: payload,
        },
      );
    },

    verifyPhoneOtpAndRegister: (
      payload: VerifyPhoneOtpAndRegisterRequest,
    ): Promise<AuthTokenPairResponse> => {
      return apiClient.post<AuthTokenPairResponse, VerifyPhoneOtpAndRegisterRequest>(
        '/auth/otp/verify',
        { body: payload },
      );
    },
  };
}

const defaultOnboardingApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/**
 * Default onboarding API instance for mobile onboarding screens.
 */
export const onboardingApi = createOnboardingApi(defaultOnboardingApiClient);
