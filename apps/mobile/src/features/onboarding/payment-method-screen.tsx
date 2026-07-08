import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { Button } from '../../components/ui/button';
import { ScreenContainer } from '../../components/ui/screen-container';
import {
  resolveApplePayMerchantIdentifier,
  resolveGooglePayMerchantIdentifier,
} from '../../config/runtime';
import { useAppTranslation } from '../../i18n/use-app-translation';
import {
  presentApplePaySheet,
  type ApplePayPaymentSheetRequest,
  type ApplePayPaymentTokenResult,
} from '../payments/apple-pay/apple-pay';
import {
  presentGooglePaySheet,
  type GooglePayPaymentSheetRequest,
  type GooglePayPaymentTokenResult,
} from '../payments/google-pay/google-pay';
import { onboardingApi, type OnboardingApi } from './onboarding-api';
import { useOnboardingSession, type PaymentGatewayOption } from './onboarding-session';

const PAYMENT_OPTIONS: readonly PaymentGatewayOption[] = [
  'ARCA',
  'IDRAM',
  'APPLE_PAY',
  'GOOGLE_PAY',
];
const PAYMENT_SETUP_AMOUNT_AMD = 5000;

interface PaymentMethodScreenProps {
  readonly api?: Pick<OnboardingApi, 'exchangeApplePayToken' | 'exchangeGooglePayToken'>;
  readonly googlePayMerchantIdentifier?: string | null;
  readonly merchantIdentifier?: string | null;
  readonly requestApplePayToken?: (
    request: ApplePayPaymentSheetRequest,
  ) => Promise<ApplePayPaymentTokenResult>;
  readonly requestGooglePayToken?: (
    request: GooglePayPaymentSheetRequest,
  ) => Promise<GooglePayPaymentTokenResult>;
}

/**
 * Renders payment method selection step with skip option for first-run onboarding.
 */
export function PaymentMethodScreen({
  api,
  googlePayMerchantIdentifier,
  merchantIdentifier,
  requestApplePayToken,
  requestGooglePayToken,
}: PaymentMethodScreenProps): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const onboardingSession = useOnboardingSession();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiClient = api ?? onboardingApi;
  const applePayMerchantIdentifier =
    merchantIdentifier ??
    resolveApplePayMerchantIdentifier(resolveApplePayMerchantIdentifierFromGlobalEnv());
  const googlePayMerchantIdentifierValue =
    googlePayMerchantIdentifier ??
    resolveGooglePayMerchantIdentifier(resolveGooglePayMerchantIdentifierFromGlobalEnv());
  const requestApplePayTokenFn =
    requestApplePayToken ??
    ((request: ApplePayPaymentSheetRequest): Promise<ApplePayPaymentTokenResult> => {
      return presentApplePaySheet(request);
    });
  const requestGooglePayTokenFn =
    requestGooglePayToken ??
    ((request: GooglePayPaymentSheetRequest): Promise<GooglePayPaymentTokenResult> => {
      return presentGooglePaySheet(request);
    });

  /**
   * Executes payment setup (Apple Pay or Google Pay token exchange when selected) and finishes onboarding.
   */
  const handleFinishOnboarding = async (): Promise<void> => {
    const selectedPaymentGateway = onboardingSession.state.selectedPaymentGateway;

    try {
      setErrorMessage(null);
      setIsSubmitting(true);

      if (selectedPaymentGateway === 'APPLE_PAY') {
        const userId = onboardingSession.state.userId;

        if (userId === null) {
          setErrorMessage(t('onboarding.payment.errors.missingUser'));
          return;
        }

        if (applePayMerchantIdentifier === null) {
          setErrorMessage(t('onboarding.payment.errors.applePayUnavailable'));
          return;
        }

        const tokenResult = await requestApplePayTokenFn({
          amount: PAYMENT_SETUP_AMOUNT_AMD,
          countryCode: 'AM',
          currencyCode: 'AMD',
          lineItemLabel: t('onboarding.payment.applePay.lineItemLabel'),
          merchantDisplayName: 'LiloCharge',
          merchantIdentifier: applePayMerchantIdentifier,
        });

        await apiClient.exchangeApplePayToken(userId, {
          cardLast4: tokenResult.cardLast4 ?? undefined,
          isDefault: true,
          paymentToken: tokenResult.paymentToken,
          transactionIdentifier: tokenResult.transactionIdentifier,
        });
      }

      if (selectedPaymentGateway === 'GOOGLE_PAY') {
        const userId = onboardingSession.state.userId;

        if (userId === null) {
          setErrorMessage(t('onboarding.payment.errors.missingUser'));
          return;
        }

        if (googlePayMerchantIdentifierValue === null) {
          setErrorMessage(t('onboarding.payment.errors.googlePayUnavailable'));
          return;
        }

        const tokenResult = await requestGooglePayTokenFn({
          amount: PAYMENT_SETUP_AMOUNT_AMD,
          countryCode: 'AM',
          currencyCode: 'AMD',
          lineItemLabel: t('onboarding.payment.googlePay.lineItemLabel'),
          merchantDisplayName: 'LiloCharge',
          merchantIdentifier: googlePayMerchantIdentifierValue,
        });

        await apiClient.exchangeGooglePayToken(userId, {
          cardLast4: tokenResult.cardLast4 ?? undefined,
          isDefault: true,
          paymentToken: tokenResult.paymentToken,
          transactionIdentifier: tokenResult.transactionIdentifier,
        });
      }

      onboardingSession.completeOnboarding();
      router.replace('/(tabs)/stations');
    } catch (error: unknown) {
      setErrorMessage(
        extractOnboardingErrorMessage(
          error,
          resolvePaymentSetupFailureMessage(selectedPaymentGateway, t),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer testID="onboarding-payment-screen">
      <View className="flex-1 justify-center px-6">
        <Text accessibilityRole="header" className="text-[28px] font-bold text-text">
          {t('onboarding.payment.title')}
        </Text>
        <Text className="mt-2 text-[15px] text-text-muted">
          {t('onboarding.payment.subtitle')}
        </Text>

        <View className="mt-4 gap-2.5">
          {PAYMENT_OPTIONS.map((gateway) => {
            const selected = onboardingSession.state.selectedPaymentGateway === gateway;

            return (
              <Pressable
                accessibilityRole="button"
                className={`min-h-11 justify-center rounded-md border px-3.5 py-3.5 active:opacity-75 ${
                  selected ? 'border-primary bg-primary' : 'border-border'
                }`}
                key={gateway}
                onPress={(): void => {
                  onboardingSession.selectPaymentGateway(gateway);
                }}
                testID={`onboarding-payment-option-${gateway}`}
              >
                <Text
                  className={`text-base font-semibold ${
                    selected ? 'text-white' : 'text-text'
                  }`}
                >
                  {t(`onboarding.payment.methods.${gateway}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {errorMessage ? (
          <Text
            className="mt-2 text-sm font-semibold text-danger"
            testID="onboarding-payment-error"
          >
            {errorMessage}
          </Text>
        ) : null}

        <Button
          className="mt-4"
          disabled={isSubmitting}
          onPress={(): void => {
            void handleFinishOnboarding();
          }}
          testID="onboarding-payment-finish"
          title={
            isSubmitting
              ? t('onboarding.payment.actions.submitting')
              : t('onboarding.payment.actions.finish')
          }
        />
        <Button
          className="mt-3"
          disabled={isSubmitting}
          onPress={(): void => {
            onboardingSession.completeOnboarding();
            router.replace('/(tabs)/stations');
          }}
          testID="onboarding-payment-skip"
          title={t('onboarding.payment.actions.skip')}
          variant="secondary"
        />
      </View>
    </ScreenContainer>
  );
}

/**
 * Extracts a user-facing onboarding error message from API errors.
 */
function extractOnboardingErrorMessage(error: unknown, fallbackMessage: string): string {
  if (
    error instanceof ApiClientError &&
    typeof error.details === 'object' &&
    error.details !== null
  ) {
    const details = error.details as Partial<ApiErrorResponse>;

    if (typeof details.message === 'string' && details.message.length > 0) {
      return details.message;
    }
  }

  return fallbackMessage;
}

/**
 * Reads EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID from Expo runtime process env when available.
 */
function resolveApplePayMerchantIdentifierFromGlobalEnv(): string | undefined {
  const globalWithProcess = globalThis as {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>;
    };
  };

  return globalWithProcess.process?.env?.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID;
}

/**
 * Reads EXPO_PUBLIC_GOOGLE_PAY_MERCHANT_ID from Expo runtime process env when available.
 */
function resolveGooglePayMerchantIdentifierFromGlobalEnv(): string | undefined {
  const globalWithProcess = globalThis as {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>;
    };
  };

  return globalWithProcess.process?.env?.EXPO_PUBLIC_GOOGLE_PAY_MERCHANT_ID;
}

/**
 * Resolves fallback setup error message for one selected payment gateway.
 */
function resolvePaymentSetupFailureMessage(
  selectedPaymentGateway: PaymentGatewayOption | null,
  translate: (key: string) => string,
): string {
  if (selectedPaymentGateway === 'GOOGLE_PAY') {
    return translate('onboarding.payment.errors.googlePaySetupFailed');
  }

  return translate('onboarding.payment.errors.applePaySetupFailed');
}
