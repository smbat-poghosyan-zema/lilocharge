import type {
  PaymentMethodResponse,
  RegisterPaymentMethodRequest,
} from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from '../onboarding/session-storage';

/** Typed API contract for stored payment-method management operations. */
export interface PaymentsApi {
  deletePaymentMethod(userId: string, methodId: string): Promise<void>;
  listPaymentMethods(userId: string): Promise<PaymentMethodResponse[]>;
  registerPaymentMethod(
    userId: string,
    request: RegisterPaymentMethodRequest,
  ): Promise<PaymentMethodResponse>;
  setDefaultPaymentMethod(userId: string, methodId: string): Promise<PaymentMethodResponse>;
}

/** Creates payment-method API helpers backed by the shared typed ApiClient. */
export function createPaymentsApi(apiClient: ApiClient): PaymentsApi {
  return {
    deletePaymentMethod: (userId: string, methodId: string): Promise<void> => {
      return apiClient.delete<void>(`/users/${userId}/payments/methods/${methodId}`);
    },
    listPaymentMethods: (userId: string): Promise<PaymentMethodResponse[]> => {
      return apiClient.get<PaymentMethodResponse[]>(`/users/${userId}/payments/methods`);
    },
    registerPaymentMethod: (
      userId: string,
      request: RegisterPaymentMethodRequest,
    ): Promise<PaymentMethodResponse> => {
      return apiClient.post<PaymentMethodResponse, RegisterPaymentMethodRequest>(
        `/users/${userId}/payments/methods`,
        {
          body: request,
        },
      );
    },
    setDefaultPaymentMethod: (
      userId: string,
      methodId: string,
    ): Promise<PaymentMethodResponse> => {
      return apiClient.patch<PaymentMethodResponse, Record<string, never>>(
        `/users/${userId}/payments/methods/${methodId}/default`,
        {
          body: {},
        },
      );
    },
  };
}

const defaultPaymentsApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/** Default payments API instance for stored payment-method management. */
export const paymentsApi = createPaymentsApi(defaultPaymentsApiClient);
