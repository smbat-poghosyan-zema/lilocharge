import type { PaymentMethodResponse } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { PaymentMethodsScreen } from './payment-methods-screen';
import type { PaymentsApi } from './payments-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ARCA_METHOD_ID = '22222222-2222-2222-2222-222222222222';
const IDRAM_METHOD_ID = '33333333-3333-3333-3333-333333333333';

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

function buildPaymentMethod(overrides: Partial<PaymentMethodResponse> = {}): PaymentMethodResponse {
  return {
    createdAt: '2026-07-01T10:00:00.000Z',
    displayLabel: 'Personal card',
    expiryMonth: null,
    expiryYear: null,
    gateway: 'ARCA',
    id: ARCA_METHOD_ID,
    isDefault: true,
    last4: '4242',
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    ...overrides,
  };
}

type PaymentsApiClientMock = { [K in keyof PaymentsApi]: jest.Mock };

function createPaymentsApiClientMock(): PaymentsApiClientMock {
  return {
    deletePaymentMethod: jest.fn(() => Promise.resolve(undefined)),
    listPaymentMethods: jest.fn(() =>
      Promise.resolve([
        buildPaymentMethod(),
        buildPaymentMethod({
          displayLabel: null,
          gateway: 'IDRAM',
          id: IDRAM_METHOD_ID,
          isDefault: false,
          last4: null,
        }),
      ]),
    ),
    registerPaymentMethod: jest.fn(() => Promise.resolve(buildPaymentMethod())),
    setDefaultPaymentMethod: jest.fn(() => Promise.resolve(buildPaymentMethod())),
  };
}

describe('PaymentMethodsScreen', () => {
  beforeEach(() => {
    mockedSessionState = { userId: USER_ID };
  });

  it('shows a loading state while the methods request is pending', () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    paymentsApiClient.listPaymentMethods.mockImplementation(() => {
      return new Promise(() => {
        // Intentionally never resolves to keep the loading state visible.
      });
    });

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    expect(screen.getByTestId('payment-methods-loading')).toBeTruthy();
  });

  it('lists stored methods with gateway labels, last4, and default badge', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId(`payment-method-${ARCA_METHOD_ID}`)).toBeTruthy();
    });

    expect(paymentsApiClient.listPaymentMethods).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByText('Personal card')).toBeTruthy();
    expect(screen.getByText(/•••• 4242/)).toBeTruthy();
    expect(screen.getByTestId(`payment-method-default-badge-${ARCA_METHOD_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`payment-method-default-badge-${IDRAM_METHOD_ID}`)).toBeNull();
    expect(screen.getByTestId(`payment-method-set-default-${IDRAM_METHOD_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`payment-method-set-default-${ARCA_METHOD_ID}`)).toBeNull();
  });

  it('shows an empty message when no methods are stored', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    paymentsApiClient.listPaymentMethods.mockResolvedValue([]);

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-empty')).toBeTruthy();
    });
  });

  it('shows an error state with retry when the list request fails', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    paymentsApiClient.listPaymentMethods.mockRejectedValueOnce(new Error('network down'));

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('payment-methods-retry'));

    await waitFor(() => {
      expect(screen.getByTestId(`payment-method-${ARCA_METHOD_ID}`)).toBeTruthy();
    });

    expect(paymentsApiClient.listPaymentMethods).toHaveBeenCalledTimes(2);
  });

  it('registers a new tokenized method and refreshes the list', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-add-toggle')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('payment-methods-add-toggle'));
    fireEvent.press(screen.getByTestId('payment-methods-gateway-IDRAM'));
    fireEvent.changeText(screen.getByTestId('payment-methods-token-input'), ' idram-token ');
    fireEvent.changeText(screen.getByTestId('payment-methods-label-input'), 'My Idram');
    fireEvent.press(screen.getByTestId('payment-methods-submit'));

    await waitFor(() => {
      expect(paymentsApiClient.registerPaymentMethod).toHaveBeenCalledWith(USER_ID, {
        displayLabel: 'My Idram',
        gateway: 'IDRAM',
        token: 'idram-token',
      });
    });

    await waitFor(() => {
      expect(paymentsApiClient.listPaymentMethods).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByTestId('payment-methods-add-form')).toBeNull();
  });

  it('validates that the token is present before submitting', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-add-toggle')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('payment-methods-add-toggle'));
    fireEvent.press(screen.getByTestId('payment-methods-submit'));

    expect(screen.getByTestId('payment-methods-form-error')).toBeTruthy();
    expect(paymentsApiClient.registerPaymentMethod).not.toHaveBeenCalled();
  });

  it('shows a form error when registration fails', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    paymentsApiClient.registerPaymentMethod.mockRejectedValue(new Error('bad token'));

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-add-toggle')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('payment-methods-add-toggle'));
    fireEvent.changeText(screen.getByTestId('payment-methods-token-input'), 'token-1');
    fireEvent.press(screen.getByTestId('payment-methods-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-form-error')).toBeTruthy();
    });

    expect(screen.getByTestId('payment-methods-add-form')).toBeTruthy();
  });

  it('deletes a method after confirmation and refreshes the list', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const paymentsApiClient = createPaymentsApiClientMock();

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId(`payment-method-delete-${IDRAM_METHOD_ID}`)).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId(`payment-method-delete-${IDRAM_METHOD_ID}`));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(paymentsApiClient.deletePaymentMethod).not.toHaveBeenCalled();

    const alertButtons = alertSpy.mock.calls[0][2] as AlertButton[];

    alertButtons[1].onPress?.();

    await waitFor(() => {
      expect(paymentsApiClient.deletePaymentMethod).toHaveBeenCalledWith(
        USER_ID,
        IDRAM_METHOD_ID,
      );
    });

    await waitFor(() => {
      expect(paymentsApiClient.listPaymentMethods).toHaveBeenCalledTimes(2);
    });

    alertSpy.mockRestore();
  });

  it('sets a method as default and surfaces failures', async () => {
    const paymentsApiClient = createPaymentsApiClientMock();

    paymentsApiClient.setDefaultPaymentMethod.mockRejectedValueOnce(new Error('conflict'));

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId(`payment-method-set-default-${IDRAM_METHOD_ID}`)).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId(`payment-method-set-default-${IDRAM_METHOD_ID}`));

    await waitFor(() => {
      expect(screen.getByTestId('payment-methods-action-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId(`payment-method-set-default-${IDRAM_METHOD_ID}`));

    await waitFor(() => {
      expect(paymentsApiClient.listPaymentMethods).toHaveBeenCalledTimes(2);
    });

    expect(paymentsApiClient.setDefaultPaymentMethod).toHaveBeenCalledWith(
      USER_ID,
      IDRAM_METHOD_ID,
    );
  });

  it('shows a sign-in prompt without requests when signed out', () => {
    mockedSessionState = { userId: null };

    const paymentsApiClient = createPaymentsApiClientMock();

    render(<PaymentMethodsScreen paymentsApiClient={paymentsApiClient} />);

    expect(screen.getByTestId('payment-methods-signed-out')).toBeTruthy();
    expect(paymentsApiClient.listPaymentMethods).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('payment-methods-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/login');
  });
});
