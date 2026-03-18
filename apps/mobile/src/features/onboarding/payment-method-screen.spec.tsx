import type {
  ExchangeApplePayTokenRequest,
  ExchangeGooglePayTokenRequest,
  PaymentMethodResponse,
} from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PaymentMethodScreen } from './payment-method-screen';

const mockReplace = jest.fn<void, [string]>();
const mockCompleteOnboarding = jest.fn<void, []>();
const mockSelectPaymentGateway = jest.fn<void, ['APPLE_PAY' | 'ARCA' | 'GOOGLE_PAY' | 'IDRAM']>();

let mockedState: {
  readonly selectedPaymentGateway: 'APPLE_PAY' | 'ARCA' | 'GOOGLE_PAY' | 'IDRAM' | null;
  readonly userId: string | null;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
  }),
}));

jest.mock('./onboarding-session', () => ({
  useOnboardingSession: () => ({
    completeOnboarding: mockCompleteOnboarding,
    selectPaymentGateway: mockSelectPaymentGateway,
    state: mockedState,
  }),
}));

describe('PaymentMethodScreen', () => {
  beforeEach(() => {
    mockedState = {
      selectedPaymentGateway: null,
      userId: '11111111-1111-1111-1111-111111111111',
    };
    mockReplace.mockReset();
    mockCompleteOnboarding.mockReset();
    mockSelectPaymentGateway.mockReset();
  });

  it('renders payment options in Armenian', () => {
    render(<PaymentMethodScreen />);

    expect(screen.getByRole('header', { name: 'Վճարման եղանակ' })).toBeTruthy();
    expect(screen.getByText('ArCa քարտեր')).toBeTruthy();
    expect(screen.getByText('Idram դրամապանակ')).toBeTruthy();
  });

  it('selects a payment method', () => {
    render(<PaymentMethodScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'ArCa քարտեր' }));

    expect(mockSelectPaymentGateway).toHaveBeenCalledWith('ARCA');
  });

  it('completes onboarding and routes to stations tab', () => {
    render(<PaymentMethodScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Ավարտել onboarding-ը' }));

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stations');
  });

  it('supports skipping payment method setup', () => {
    render(<PaymentMethodScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Բաց թողնել վճարումը' }));

    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stations');
  });

  it('runs Apple Pay payment sheet and token exchange before finishing onboarding', async () => {
    mockedState = {
      selectedPaymentGateway: 'APPLE_PAY',
      userId: '11111111-1111-1111-1111-111111111111',
    };
    const exchangeApplePayToken = jest
      .fn<Promise<PaymentMethodResponse>, [string, ExchangeApplePayTokenRequest]>()
      .mockResolvedValue({
        createdAt: '2026-02-17T00:00:00.000Z',
        expiryMonth: null,
        expiryYear: null,
        gateway: 'APPLE_PAY',
        id: 'payment-method-1',
        isDefault: true,
        last4: '4242',
        updatedAt: '2026-02-17T00:00:00.000Z',
        userId: '11111111-1111-1111-1111-111111111111',
      });
    const requestApplePayToken = jest
      .fn<
        Promise<{
          readonly cardLast4: string | null;
          readonly paymentToken: string;
          readonly transactionIdentifier: string;
        }>,
        [unknown]
      >()
      .mockResolvedValue({
        cardLast4: '4242',
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      });
    const exchangeGooglePayToken = jest.fn<
      Promise<PaymentMethodResponse>,
      [string, ExchangeGooglePayTokenRequest]
    >();

    render(
      <PaymentMethodScreen
        api={{ exchangeApplePayToken, exchangeGooglePayToken }}
        merchantIdentifier="merchant.com.lilocharge"
        requestApplePayToken={requestApplePayToken}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Ավարտել onboarding-ը' }));

    await waitFor(() => {
      expect(requestApplePayToken).toHaveBeenCalledTimes(1);
      expect(exchangeApplePayToken).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', {
        cardLast4: '4242',
        isDefault: true,
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      });
      expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stations');
    });
  });

  it('runs Google Pay payment sheet and token exchange before finishing onboarding', async () => {
    mockedState = {
      selectedPaymentGateway: 'GOOGLE_PAY',
      userId: '11111111-1111-1111-1111-111111111111',
    };
    const exchangeApplePayToken = jest.fn<
      Promise<PaymentMethodResponse>,
      [string, ExchangeApplePayTokenRequest]
    >();
    const exchangeGooglePayToken = jest
      .fn<Promise<PaymentMethodResponse>, [string, ExchangeGooglePayTokenRequest]>()
      .mockResolvedValue({
        createdAt: '2026-02-17T00:00:00.000Z',
        expiryMonth: null,
        expiryYear: null,
        gateway: 'GOOGLE_PAY',
        id: 'payment-method-2',
        isDefault: true,
        last4: '1111',
        updatedAt: '2026-02-17T00:00:00.000Z',
        userId: '11111111-1111-1111-1111-111111111111',
      });
    const requestGooglePayToken = jest
      .fn<
        Promise<{
          readonly cardLast4: string | null;
          readonly paymentToken: string;
          readonly transactionIdentifier: string;
        }>,
        [unknown]
      >()
      .mockResolvedValue({
        cardLast4: '1111',
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      });

    render(
      <PaymentMethodScreen
        api={{ exchangeApplePayToken, exchangeGooglePayToken }}
        googlePayMerchantIdentifier="merchant.com.lilocharge"
        requestGooglePayToken={requestGooglePayToken}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Ավարտել onboarding-ը' }));

    await waitFor(() => {
      expect(requestGooglePayToken).toHaveBeenCalledTimes(1);
      expect(exchangeGooglePayToken).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', {
        cardLast4: '1111',
        isDefault: true,
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      });
      expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stations');
    });
  });

  it('shows error and blocks completion when Apple Pay user id is missing', async () => {
    mockedState = {
      selectedPaymentGateway: 'APPLE_PAY',
      userId: null,
    };
    const requestApplePayToken = jest.fn<
      Promise<{
        readonly cardLast4: string | null;
        readonly paymentToken: string;
        readonly transactionIdentifier: string;
      }>,
      [unknown]
    >();

    render(
      <PaymentMethodScreen
        merchantIdentifier="merchant.com.lilocharge"
        requestApplePayToken={requestApplePayToken}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Ավարտել onboarding-ը' }));

    await waitFor(() => {
      expect(
        screen.getByText('Հաշվի տվյալներ չեն գտնվել: Վերադարձրեք գրանցման փուլը:'),
      ).toBeTruthy();
    });
    expect(requestApplePayToken).not.toHaveBeenCalled();
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows error and blocks completion when Apple Pay flow fails', async () => {
    mockedState = {
      selectedPaymentGateway: 'APPLE_PAY',
      userId: '11111111-1111-1111-1111-111111111111',
    };
    const requestApplePayToken = jest
      .fn<
        Promise<{
          readonly cardLast4: string | null;
          readonly paymentToken: string;
          readonly transactionIdentifier: string;
        }>,
        [unknown]
      >()
      .mockRejectedValue(new Error('Native Apple Pay failed'));

    render(
      <PaymentMethodScreen
        merchantIdentifier="merchant.com.lilocharge"
        requestApplePayToken={requestApplePayToken}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Ավարտել onboarding-ը' }));

    await waitFor(() => {
      expect(screen.getByText('Չհաջողվեց ակտիվացնել Apple Pay-ը:')).toBeTruthy();
    });
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows error and blocks completion when Google Pay flow fails', async () => {
    mockedState = {
      selectedPaymentGateway: 'GOOGLE_PAY',
      userId: '11111111-1111-1111-1111-111111111111',
    };
    const requestGooglePayToken = jest
      .fn<
        Promise<{
          readonly cardLast4: string | null;
          readonly paymentToken: string;
          readonly transactionIdentifier: string;
        }>,
        [unknown]
      >()
      .mockRejectedValue(new Error('Native Google Pay failed'));

    render(
      <PaymentMethodScreen
        googlePayMerchantIdentifier="merchant.com.lilocharge"
        requestGooglePayToken={requestGooglePayToken}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Ավարտել onboarding-ը' }));

    await waitFor(() => {
      expect(screen.getByText('Չհաջողվեց ակտիվացնել Google Pay-ը:')).toBeTruthy();
    });
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
