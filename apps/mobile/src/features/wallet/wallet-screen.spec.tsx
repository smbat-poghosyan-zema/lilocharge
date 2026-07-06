import type {
  PaymentMethodResponse,
  WalletResponse,
  WalletTransactionResponse,
  WalletTransactionsResponse,
} from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { PaymentsApi } from '../payments/payments-api';
import type { WalletApi } from './wallet-api';
import { WalletScreen } from './wallet-screen';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const WALLET_ID = '22222222-2222-2222-2222-222222222222';
const ARCA_METHOD_ID = '33333333-3333-3333-3333-333333333333';
const IDRAM_METHOD_ID = '44444444-4444-4444-4444-444444444444';

const mockPush = jest.fn<void, [string]>();
const mockReplace = jest.fn<void, [string]>();

let mockedSessionState: { userId: string | null };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../onboarding/onboarding-session', () => ({
  useOnboardingSession: () => ({
    state: mockedSessionState,
  }),
}));

function buildWallet(overrides: Partial<WalletResponse> = {}): WalletResponse {
  return {
    balance: 500000,
    createdAt: '2026-07-01T10:00:00.000Z',
    id: WALLET_ID,
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    ...overrides,
  };
}

function buildTransaction(
  overrides: Partial<WalletTransactionResponse> = {},
): WalletTransactionResponse {
  return {
    amount: 100000,
    balanceAfter: 500000,
    balanceBefore: 400000,
    createdAt: '2026-07-01T10:00:00.000Z',
    description: 'Wallet top-up',
    gateway: 'ARCA',
    gatewayTransactionId: 'gw-tx-1',
    id: '55555555-5555-5555-5555-555555555555',
    sessionId: null,
    type: 'TOP_UP',
    walletId: WALLET_ID,
    ...overrides,
  };
}

function buildMethod(overrides: Partial<PaymentMethodResponse> = {}): PaymentMethodResponse {
  return {
    createdAt: '2026-07-01T10:00:00.000Z',
    displayLabel: 'Personal card',
    expiryMonth: null,
    expiryYear: null,
    gateway: 'ARCA',
    id: ARCA_METHOD_ID,
    isDefault: false,
    last4: '4242',
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    ...overrides,
  };
}

interface WalletApiClientMock {
  readonly getWallet: jest.Mock<Promise<WalletResponse>, [string]>;
  readonly listTransactions: jest.Mock<Promise<WalletTransactionsResponse>, [string]>;
  readonly topUp: jest.Mock;
}

function createWalletApiClientMock(): WalletApiClientMock {
  return {
    getWallet: jest.fn<Promise<WalletResponse>, [string]>(() => Promise.resolve(buildWallet())),
    listTransactions: jest.fn<Promise<WalletTransactionsResponse>, [string]>(() =>
      Promise.resolve({
        hasMore: false,
        nextCursor: null,
        transactions: [
          buildTransaction(),
          buildTransaction({
            amount: 25000,
            id: '66666666-6666-6666-6666-666666666666',
            type: 'DEDUCTION',
          }),
        ],
      }),
    ),
    topUp: jest.fn(() =>
      Promise.resolve({
        gatewayTransactionId: 'gw-tx-2',
        newBalance: 1000000,
        transaction: buildTransaction({
          amount: 500000,
          id: '77777777-7777-7777-7777-777777777777',
        }),
      }),
    ),
  };
}

function createPaymentsApiClientMock(
  methods: readonly PaymentMethodResponse[] = [
    buildMethod(),
    buildMethod({ gateway: 'IDRAM', id: IDRAM_METHOD_ID, isDefault: true, last4: null }),
  ],
): Pick<PaymentsApi, 'listPaymentMethods'> & { listPaymentMethods: jest.Mock } {
  return {
    listPaymentMethods: jest.fn(() => Promise.resolve([...methods])),
  };
}

describe('WalletScreen', () => {
  beforeEach(() => {
    mockedSessionState = { userId: USER_ID };
  });

  it('shows a loading state while the wallet requests are pending', () => {
    const walletApiClient = createWalletApiClientMock();

    walletApiClient.getWallet.mockImplementation(() => {
      return new Promise<WalletResponse>(() => {
        // Intentionally never resolves to keep the loading state visible.
      });
    });

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    expect(screen.getByTestId('wallet-loading')).toBeTruthy();
  });

  it('renders the AMD balance and the transactions ledger', async () => {
    const walletApiClient = createWalletApiClientMock();

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-screen')).toBeTruthy();
    });

    expect(walletApiClient.getWallet).toHaveBeenCalledWith(USER_ID);
    expect(walletApiClient.listTransactions).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('5000 ֏');
    expect(
      screen.getByTestId('wallet-transaction-55555555-5555-5555-5555-555555555555'),
    ).toHaveTextContent('+1000 ֏');
    expect(
      screen.getByTestId('wallet-transaction-66666666-6666-6666-6666-666666666666'),
    ).toHaveTextContent('-250 ֏');
    expect(screen.getAllByText('2026-07-01').length).toBe(2);
  });

  it('preselects the default eligible payment method for top-ups', async () => {
    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={createWalletApiClientMock() as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId(`wallet-topup-method-${IDRAM_METHOD_ID}`)).toBeTruthy();
    });

    expect(
      screen.getByTestId(`wallet-topup-method-${IDRAM_METHOD_ID}`).props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('tops up with a preset amount and updates balance and ledger', async () => {
    const walletApiClient = createWalletApiClientMock();

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-topup-submit')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('wallet-topup-preset-5000'));
    fireEvent.press(screen.getByTestId(`wallet-topup-method-${ARCA_METHOD_ID}`));
    fireEvent.press(screen.getByTestId('wallet-topup-submit'));

    await waitFor(() => {
      expect(walletApiClient.topUp).toHaveBeenCalledWith(USER_ID, {
        amount: 500000,
        gateway: 'ARCA',
        paymentMethodId: ARCA_METHOD_ID,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('wallet-topup-success')).toBeTruthy();
    });

    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('10000 ֏');
    expect(
      screen.getByTestId('wallet-transaction-77777777-7777-7777-7777-777777777777'),
    ).toBeTruthy();
  });

  it('tops up with a custom amount converted to AMD cents', async () => {
    const walletApiClient = createWalletApiClientMock();

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-topup-custom-input')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('wallet-topup-custom-input'), '750');
    fireEvent.press(screen.getByTestId('wallet-topup-submit'));

    await waitFor(() => {
      expect(walletApiClient.topUp).toHaveBeenCalledWith(USER_ID, {
        amount: 75000,
        gateway: 'IDRAM',
        paymentMethodId: IDRAM_METHOD_ID,
      });
    });
  });

  it('rejects invalid custom amounts without calling the API', async () => {
    const walletApiClient = createWalletApiClientMock();

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-topup-custom-input')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('wallet-topup-custom-input'), 'abc');
    fireEvent.press(screen.getByTestId('wallet-topup-submit'));

    expect(screen.getByTestId('wallet-topup-error')).toBeTruthy();
    expect(walletApiClient.topUp).not.toHaveBeenCalled();
  });

  it('shows a top-up error when the request fails', async () => {
    const walletApiClient = createWalletApiClientMock();

    walletApiClient.topUp.mockRejectedValue(new Error('gateway down'));

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-topup-submit')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('wallet-topup-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-topup-error')).toBeTruthy();
    });
  });

  it('prompts to add a payment method when none are eligible', async () => {
    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock([
          buildMethod({ gateway: 'APPLE_PAY', id: '88888888-8888-8888-8888-888888888888' }),
        ])}
        walletApiClient={createWalletApiClientMock() as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-no-methods')).toBeTruthy();
    });

    expect(screen.queryByTestId('wallet-topup-submit')).toBeNull();

    fireEvent.press(screen.getByTestId('wallet-add-method'));

    expect(mockPush).toHaveBeenCalledWith('/payment-methods');
  });

  it('shows an empty ledger message when there are no transactions', async () => {
    const walletApiClient = createWalletApiClientMock();

    walletApiClient.listTransactions.mockResolvedValue({
      hasMore: false,
      nextCursor: null,
      transactions: [],
    });

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-transactions-empty')).toBeTruthy();
    });
  });

  it('shows an error state with retry when loading fails', async () => {
    const walletApiClient = createWalletApiClientMock();

    walletApiClient.getWallet.mockRejectedValueOnce(new Error('network down'));

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('wallet-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-screen')).toBeTruthy();
    });

    expect(walletApiClient.getWallet).toHaveBeenCalledTimes(2);
  });

  it('shows a sign-in prompt without requests when signed out', () => {
    mockedSessionState = { userId: null };

    const walletApiClient = createWalletApiClientMock();

    render(
      <WalletScreen
        paymentsApiClient={createPaymentsApiClientMock()}
        walletApiClient={walletApiClient as unknown as WalletApi}
      />,
    );

    expect(screen.getByTestId('wallet-signed-out')).toBeTruthy();
    expect(walletApiClient.getWallet).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('wallet-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/login');
  });
});
