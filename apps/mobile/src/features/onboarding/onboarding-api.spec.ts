import type { ApiClient, ApiRequestMethod, ApiRequestOptions } from '../../api/api-client';
import { createOnboardingApi } from './onboarding-api';

describe('createOnboardingApi', () => {
  it('exchanges one Apple Pay token for a user payment method', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue({
      createdAt: '2026-02-17T00:00:00.000Z',
      expiryMonth: null,
      expiryYear: null,
      gateway: 'APPLE_PAY',
      id: 'payment-method-1',
      isDefault: true,
      last4: '4242',
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: 'user-id',
    });
    const onboardingApi = createOnboardingApi(apiClientMock);

    await onboardingApi.exchangeApplePayToken('user-id', {
      cardLast4: '4242',
      isDefault: true,
      paymentToken: 'apple-pay-payment-token',
      transactionIdentifier: 'apple-pay-transaction-1',
    });

    expect(apiClientMock.post.mock.calls).toEqual([
      [
        '/users/user-id/payments/apple-pay/token-exchange',
        {
          body: {
            cardLast4: '4242',
            isDefault: true,
            paymentToken: 'apple-pay-payment-token',
            transactionIdentifier: 'apple-pay-transaction-1',
          },
        },
      ],
    ]);
  });

  it('requests phone OTP via auth otp request endpoint', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue({
      expiresInSeconds: 300,
      message: 'OTP sent successfully',
    });
    const onboardingApi = createOnboardingApi(apiClientMock);

    const response = await onboardingApi.requestPhoneOtp({ phone: '+37477123456' });

    expect(response.expiresInSeconds).toBe(300);
    expect(apiClientMock.post.mock.calls).toEqual([
      ['/auth/otp/request', { body: { phone: '+37477123456' } }],
    ]);
  });

  it('exchanges one Google Pay token for a user payment method', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue({
      createdAt: '2026-02-17T00:00:00.000Z',
      expiryMonth: null,
      expiryYear: null,
      gateway: 'GOOGLE_PAY',
      id: 'payment-method-1',
      isDefault: true,
      last4: '4242',
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: 'user-id',
    });
    const onboardingApi = createOnboardingApi(apiClientMock);

    await onboardingApi.exchangeGooglePayToken('user-id', {
      cardLast4: '4242',
      isDefault: true,
      paymentToken: 'google-pay-payment-token',
      transactionIdentifier: 'google-pay-transaction-1',
    });

    expect(apiClientMock.post.mock.calls).toEqual([
      [
        '/users/user-id/payments/google-pay/token-exchange',
        {
          body: {
            cardLast4: '4242',
            isDefault: true,
            paymentToken: 'google-pay-payment-token',
            transactionIdentifier: 'google-pay-transaction-1',
          },
        },
      ],
    ]);
  });

  it('verifies OTP and registers user via auth verify endpoint', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
    });
    const onboardingApi = createOnboardingApi(apiClientMock);

    const response = await onboardingApi.verifyPhoneOtpAndRegister({
      code: '123456',
      displayName: 'Անի',
      email: 'ani@example.com',
      language: 'hy',
      password: 'Password123!',
      phone: '+37477123456',
    });

    expect(response.accessToken).toBe('access');
    expect(apiClientMock.post.mock.calls).toEqual([
      [
        '/auth/otp/verify',
        {
          body: {
            code: '123456',
            displayName: 'Անի',
            email: 'ani@example.com',
            language: 'hy',
            password: 'Password123!',
            phone: '+37477123456',
          },
        },
      ],
    ]);
  });

  it('creates vehicle profile for a user', async () => {
    const apiClientMock = createApiClientMock();
    apiClientMock.post.mockResolvedValue({
      batteryCapacity: 64,
      connectorType: 'CCS',
      createdAt: '2026-02-17T00:00:00.000Z',
      id: 'vehicle-id',
      make: 'Kia',
      maxChargePower: 240,
      model: 'EV6',
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: 'user-id',
      year: 2024,
    });
    const onboardingApi = createOnboardingApi(apiClientMock);

    await onboardingApi.createVehicleProfile('user-id', {
      batteryCapacity: 64,
      make: 'Kia',
      maxChargePower: 240,
      model: 'EV6',
      year: 2024,
    });

    expect(apiClientMock.post.mock.calls).toEqual([
      [
        '/users/user-id/vehicles',
        {
          body: {
            batteryCapacity: 64,
            make: 'Kia',
            maxChargePower: 240,
            model: 'EV6',
            year: 2024,
          },
        },
      ],
    ]);
  });
});

/**
 * Creates a lightweight ApiClient mock for onboarding API unit tests.
 */
function createApiClientMock(): jest.Mocked<ApiClient> {
  return {
    delete: jest.fn<
      Promise<unknown>,
      [path: string, options?: ApiRequestOptions<undefined, unknown>]
    >(),
    get: jest.fn<
      Promise<unknown>,
      [path: string, options?: ApiRequestOptions<undefined, unknown>]
    >(),
    patch: jest.fn<
      Promise<unknown>,
      [path: string, options: ApiRequestOptions<unknown, unknown>]
    >(),
    post: jest.fn<Promise<unknown>, [path: string, options: ApiRequestOptions<unknown, unknown>]>(),
    put: jest.fn<Promise<unknown>, [path: string, options: ApiRequestOptions<unknown, unknown>]>(),
    request: jest.fn<
      Promise<unknown>,
      [method: ApiRequestMethod, path: string, options?: ApiRequestOptions<unknown, unknown>]
    >(),
  } as unknown as jest.Mocked<ApiClient>;
}
