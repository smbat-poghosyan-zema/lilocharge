import type { PaymentMethodResponse } from '@lilocharge/shared-types';

import { createPaymentsApi } from './payments-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const METHOD_ID = '22222222-2222-2222-2222-222222222222';

function buildPaymentMethodResponse(
  overrides: Partial<PaymentMethodResponse> = {},
): PaymentMethodResponse {
  return {
    createdAt: '2026-07-01T10:00:00.000Z',
    displayLabel: 'Personal ArCa card',
    expiryMonth: null,
    expiryYear: null,
    gateway: 'ARCA',
    id: METHOD_ID,
    isDefault: false,
    last4: '4242',
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    ...overrides,
  };
}

describe('payments api', () => {
  it('lists stored payment methods through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn(() => Promise.resolve([buildPaymentMethodResponse()])),
    };

    const paymentsApi = createPaymentsApi(apiClientMock as never);

    await expect(paymentsApi.listPaymentMethods(USER_ID)).resolves.toEqual([
      buildPaymentMethodResponse(),
    ]);

    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/payments/methods`);
  });

  it('registers one tokenized payment method through the typed API client', async () => {
    const apiClientMock = {
      post: jest.fn(() => Promise.resolve(buildPaymentMethodResponse({ isDefault: true }))),
    };

    const paymentsApi = createPaymentsApi(apiClientMock as never);

    await expect(
      paymentsApi.registerPaymentMethod(USER_ID, {
        displayLabel: 'Personal ArCa card',
        gateway: 'ARCA',
        token: 'arca-binding-token',
      }),
    ).resolves.toMatchObject({
      gateway: 'ARCA',
      id: METHOD_ID,
      isDefault: true,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${USER_ID}/payments/methods`, {
      body: {
        displayLabel: 'Personal ArCa card',
        gateway: 'ARCA',
        token: 'arca-binding-token',
      },
    });
  });

  it('deletes one stored payment method through the typed API client', async () => {
    const apiClientMock = {
      delete: jest.fn(() => Promise.resolve(undefined)),
    };

    const paymentsApi = createPaymentsApi(apiClientMock as never);

    await expect(paymentsApi.deletePaymentMethod(USER_ID, METHOD_ID)).resolves.toBeUndefined();

    expect(apiClientMock.delete).toHaveBeenCalledWith(
      `/users/${USER_ID}/payments/methods/${METHOD_ID}`,
    );
  });

  it('sets one stored payment method as default through the typed API client', async () => {
    const apiClientMock = {
      patch: jest.fn(() => Promise.resolve(buildPaymentMethodResponse({ isDefault: true }))),
    };

    const paymentsApi = createPaymentsApi(apiClientMock as never);

    await expect(paymentsApi.setDefaultPaymentMethod(USER_ID, METHOD_ID)).resolves.toMatchObject({
      id: METHOD_ID,
      isDefault: true,
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith(
      `/users/${USER_ID}/payments/methods/${METHOD_ID}/default`,
      {
        body: {},
      },
    );
  });
});
