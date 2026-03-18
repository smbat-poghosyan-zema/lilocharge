import {
  ApplePayUnavailableError,
  canPresentApplePaySheet,
  presentApplePaySheet,
  type ApplePayNativeModule,
} from './apple-pay';

interface NativePaymentSheetResult {
  readonly cardLast4?: string;
  readonly paymentToken?: string;
  readonly transactionIdentifier?: string;
}

describe('apple-pay bridge', () => {
  it('returns false when platform is not ios', async () => {
    const canMakePayments = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
    const nativeModuleMock: ApplePayNativeModule = {
      canMakePayments,
      presentPaymentSheet: jest.fn<Promise<NativePaymentSheetResult>, [unknown]>(),
    };

    await expect(
      canPresentApplePaySheet({
        nativeModule: nativeModuleMock,
        platformOs: 'android',
      }),
    ).resolves.toBe(false);
    expect(canMakePayments).not.toHaveBeenCalled();
  });

  it('returns true when native module reports Apple Pay availability', async () => {
    const canMakePayments = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
    const nativeModuleMock: ApplePayNativeModule = {
      canMakePayments,
      presentPaymentSheet: jest.fn<Promise<NativePaymentSheetResult>, [unknown]>(),
    };

    await expect(
      canPresentApplePaySheet({
        nativeModule: nativeModuleMock,
        platformOs: 'ios',
      }),
    ).resolves.toBe(true);
    expect(canMakePayments).toHaveBeenCalledTimes(1);
  });

  it('presents payment sheet and maps one successful token response', async () => {
    const presentPaymentSheet = jest
      .fn<Promise<NativePaymentSheetResult>, [unknown]>()
      .mockResolvedValue({
        cardLast4: '4242',
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      });
    const nativeModuleMock: ApplePayNativeModule = {
      canMakePayments: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
      presentPaymentSheet,
    };

    await expect(
      presentApplePaySheet(
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
          platformOs: 'ios',
        },
      ),
    ).resolves.toEqual({
      cardLast4: '4242',
      paymentToken: 'apple-pay-payment-token',
      transactionIdentifier: 'apple-pay-transaction-1',
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

  it('throws unavailable error when Apple Pay module is missing', async () => {
    await expect(
      presentApplePaySheet(
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
          platformOs: 'ios',
        },
      ),
    ).rejects.toBeInstanceOf(ApplePayUnavailableError);
  });

  it('throws unavailable error when Apple Pay module returns invalid response', async () => {
    const nativeModuleMock: ApplePayNativeModule = {
      canMakePayments: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
      presentPaymentSheet: jest
        .fn<Promise<NativePaymentSheetResult>, [unknown]>()
        .mockResolvedValue({
          transactionIdentifier: 'apple-pay-transaction-1',
        }),
    };

    await expect(
      presentApplePaySheet(
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
          platformOs: 'ios',
        },
      ),
    ).rejects.toBeInstanceOf(ApplePayUnavailableError);
  });
});
