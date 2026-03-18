import {
  GooglePayUnavailableError,
  canPresentGooglePaySheet,
  presentGooglePaySheet,
  type GooglePayNativeModule,
} from './google-pay';

interface NativePaymentSheetResult {
  readonly cardLast4?: string;
  readonly paymentToken?: string;
  readonly transactionIdentifier?: string;
}

describe('google-pay bridge', () => {
  it('returns false when platform is not android', async () => {
    const isReadyToPay = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
    const nativeModuleMock: GooglePayNativeModule = {
      isReadyToPay,
      presentPaymentSheet: jest.fn<Promise<NativePaymentSheetResult>, [unknown]>(),
    };

    await expect(
      canPresentGooglePaySheet({
        nativeModule: nativeModuleMock,
        platformOs: 'ios',
      }),
    ).resolves.toBe(false);
    expect(isReadyToPay).not.toHaveBeenCalled();
  });

  it('returns true when native module reports Google Pay availability', async () => {
    const isReadyToPay = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
    const nativeModuleMock: GooglePayNativeModule = {
      isReadyToPay,
      presentPaymentSheet: jest.fn<Promise<NativePaymentSheetResult>, [unknown]>(),
    };

    await expect(
      canPresentGooglePaySheet({
        nativeModule: nativeModuleMock,
        platformOs: 'android',
      }),
    ).resolves.toBe(true);
    expect(isReadyToPay).toHaveBeenCalledTimes(1);
  });

  it('presents payment sheet and maps one successful token response', async () => {
    const presentPaymentSheet = jest
      .fn<Promise<NativePaymentSheetResult>, [unknown]>()
      .mockResolvedValue({
        cardLast4: '1111',
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      });
    const nativeModuleMock: GooglePayNativeModule = {
      isReadyToPay: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
      presentPaymentSheet,
    };

    await expect(
      presentGooglePaySheet(
        {
          amount: 5000,
          countryCode: 'AM',
          currencyCode: 'AMD',
          lineItemLabel: 'LiloCharge setup',
          merchantDisplayName: 'LiloCharge',
          merchantIdentifier: 'merchant.com.lilocharge',
        },
        {
          nativeModule: nativeModuleMock,
          platformOs: 'android',
        },
      ),
    ).resolves.toEqual({
      cardLast4: '1111',
      paymentToken: 'google-pay-payment-token',
      transactionIdentifier: 'google-pay-transaction-1',
    });

    expect(presentPaymentSheet).toHaveBeenCalledWith({
      amount: '5000.00',
      countryCode: 'AM',
      currencyCode: 'AMD',
      lineItemLabel: 'LiloCharge setup',
      merchantDisplayName: 'LiloCharge',
      merchantIdentifier: 'merchant.com.lilocharge',
    });
  });

  it('throws unavailable error when Google Pay module is missing', async () => {
    await expect(
      presentGooglePaySheet(
        {
          amount: 5000,
          countryCode: 'AM',
          currencyCode: 'AMD',
          lineItemLabel: 'LiloCharge setup',
          merchantDisplayName: 'LiloCharge',
          merchantIdentifier: 'merchant.com.lilocharge',
        },
        {
          nativeModule: null,
          platformOs: 'android',
        },
      ),
    ).rejects.toBeInstanceOf(GooglePayUnavailableError);
  });

  it('throws unavailable error when Google Pay module returns invalid response', async () => {
    const nativeModuleMock: GooglePayNativeModule = {
      isReadyToPay: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
      presentPaymentSheet: jest
        .fn<Promise<NativePaymentSheetResult>, [unknown]>()
        .mockResolvedValue({
          transactionIdentifier: 'google-pay-transaction-1',
        }),
    };

    await expect(
      presentGooglePaySheet(
        {
          amount: 5000,
          countryCode: 'AM',
          currencyCode: 'AMD',
          lineItemLabel: 'LiloCharge setup',
          merchantDisplayName: 'LiloCharge',
          merchantIdentifier: 'merchant.com.lilocharge',
        },
        {
          nativeModule: nativeModuleMock,
          platformOs: 'android',
        },
      ),
    ).rejects.toBeInstanceOf(GooglePayUnavailableError);
  });
});
