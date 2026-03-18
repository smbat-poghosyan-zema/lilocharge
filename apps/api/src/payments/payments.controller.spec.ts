import type {
  ExchangeApplePayTokenRequest,
  ExchangeGooglePayTokenRequest,
  PaymentMethodResponse,
} from '@lilocharge/shared-types';

import type { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import type { ExchangeApplePayTokenDto } from './dto/exchange-apple-pay-token.dto';

interface PaymentsServiceMock {
  readonly exchangeApplePayToken: jest.Mock<
    Promise<PaymentMethodResponse>,
    [string, ExchangeApplePayTokenRequest]
  >;
  readonly exchangeGooglePayToken: jest.Mock<
    Promise<PaymentMethodResponse>,
    [string, ExchangeGooglePayTokenRequest]
  >;
  readonly setWalletAsPaymentMethod: jest.Mock<Promise<PaymentMethodResponse>, [string]>;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Builds a stable payment method fixture for controller delegation assertions.
 */
function buildPaymentMethodResponse(): PaymentMethodResponse {
  return {
    createdAt: '2026-02-17T00:00:00.000Z',
    expiryMonth: null,
    expiryYear: null,
    gateway: 'APPLE_PAY',
    id: 'payment-method-1',
    isDefault: true,
    last4: '4242',
    updatedAt: '2026-02-17T00:00:00.000Z',
    userId: USER_ID,
  };
}

describe('PaymentsController', () => {
  it('delegates Apple Pay token exchange to payments service', async () => {
    const paymentMethodResponse = buildPaymentMethodResponse();
    const paymentsServiceMock: PaymentsServiceMock = {
      exchangeApplePayToken: jest
        .fn<Promise<PaymentMethodResponse>, [string, ExchangeApplePayTokenRequest]>()
        .mockResolvedValue(paymentMethodResponse),
      exchangeGooglePayToken: jest.fn<
        Promise<PaymentMethodResponse>,
        [string, ExchangeGooglePayTokenRequest]
      >(),
      setWalletAsPaymentMethod: jest.fn<Promise<PaymentMethodResponse>, [string]>(),
    };
    const controller = new PaymentsController(paymentsServiceMock as unknown as PaymentsService);

    const payload: ExchangeApplePayTokenDto = {
      cardLast4: '4242',
      isDefault: true,
      paymentToken: 'apple-pay-payment-token',
      transactionIdentifier: 'apple-pay-transaction-1',
    };

    await expect(controller.exchangeApplePayToken(USER_ID, payload)).resolves.toEqual(
      paymentMethodResponse,
    );
    expect(paymentsServiceMock.exchangeApplePayToken).toHaveBeenCalledWith(USER_ID, payload);
  });

  it('delegates Google Pay token exchange to payments service', async () => {
    const paymentMethodResponse = {
      ...buildPaymentMethodResponse(),
      gateway: 'GOOGLE_PAY' as const,
    };
    const paymentsServiceMock: PaymentsServiceMock = {
      exchangeApplePayToken: jest.fn<
        Promise<PaymentMethodResponse>,
        [string, ExchangeApplePayTokenRequest]
      >(),
      exchangeGooglePayToken: jest
        .fn<Promise<PaymentMethodResponse>, [string, ExchangeGooglePayTokenRequest]>()
        .mockResolvedValue(paymentMethodResponse),
      setWalletAsPaymentMethod: jest.fn<Promise<PaymentMethodResponse>, [string]>(),
    };
    const controller = new PaymentsController(paymentsServiceMock as unknown as PaymentsService);

    const payload = {
      cardLast4: '4242',
      isDefault: true,
      paymentToken: 'google-pay-payment-token',
      transactionIdentifier: 'google-pay-transaction-1',
    };

    await expect(controller.exchangeGooglePayToken(USER_ID, payload)).resolves.toEqual(
      paymentMethodResponse,
    );
    expect(paymentsServiceMock.exchangeGooglePayToken).toHaveBeenCalledWith(USER_ID, payload);
  });

  it('delegates wallet payment method setup to payments service', async () => {
    const walletPaymentMethodResponse = {
      ...buildPaymentMethodResponse(),
      gateway: 'WALLET' as const,
      last4: null,
    };
    const paymentsServiceMock: PaymentsServiceMock = {
      exchangeApplePayToken: jest.fn<
        Promise<PaymentMethodResponse>,
        [string, ExchangeApplePayTokenRequest]
      >(),
      exchangeGooglePayToken: jest.fn<
        Promise<PaymentMethodResponse>,
        [string, ExchangeGooglePayTokenRequest]
      >(),
      setWalletAsPaymentMethod: jest
        .fn<Promise<PaymentMethodResponse>, [string]>()
        .mockResolvedValue(walletPaymentMethodResponse),
    };
    const controller = new PaymentsController(paymentsServiceMock as unknown as PaymentsService);

    await expect(controller.setWalletAsPaymentMethod(USER_ID)).resolves.toEqual(
      walletPaymentMethodResponse,
    );
    expect(paymentsServiceMock.setWalletAsPaymentMethod).toHaveBeenCalledWith(USER_ID);
  });
});
