import type { ApiErrorResponse } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
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
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('onboarding.payment.title')}
      </Text>
      <Text style={styles.subtitle}>{t('onboarding.payment.subtitle')}</Text>

      <View style={styles.options}>
        {PAYMENT_OPTIONS.map((gateway) => {
          const selected = onboardingSession.state.selectedPaymentGateway === gateway;

          return (
            <Pressable
              key={gateway}
              accessibilityRole="button"
              style={({ pressed }): object[] => [
                styles.optionButton,
                selected ? styles.optionButtonSelected : {},
                pressed ? styles.buttonPressed : {},
              ]}
              onPress={(): void => {
                onboardingSession.selectPaymentGateway(gateway);
              }}
            >
              <Text style={selected ? styles.optionTextSelected : styles.optionText}>
                {t(`onboarding.payment.methods.${gateway}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        style={({ pressed }): object[] => [
          styles.primaryButton,
          isSubmitting ? styles.buttonDisabled : {},
          pressed ? styles.buttonPressed : {},
        ]}
        onPress={(): void => {
          void handleFinishOnboarding();
        }}
      >
        <Text style={styles.primaryButtonText}>
          {isSubmitting
            ? t('onboarding.payment.actions.submitting')
            : t('onboarding.payment.actions.finish')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        style={({ pressed }): object[] => [
          styles.secondaryButton,
          pressed ? styles.buttonPressed : {},
        ]}
        onPress={(): void => {
          onboardingSession.completeOnboarding();
          router.replace('/(tabs)/stations');
        }}
      >
        <Text style={styles.secondaryButtonText}>{t('onboarding.payment.actions.skip')}</Text>
      </Pressable>
    </View>
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

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  container: {
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginTop: 8,
  },
  optionButton: {
    borderColor: '#D1D5DB',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionButtonSelected: {
    backgroundColor: '#14532D',
    borderColor: '#14532D',
  },
  optionText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  options: {
    marginTop: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#166534',
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#166534',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 15,
    marginTop: 8,
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
  },
});
