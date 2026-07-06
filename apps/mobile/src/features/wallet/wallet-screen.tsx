import type {
  PaymentMethodResponse,
  WalletResponse,
  WalletTopUpResponse,
  WalletTransactionResponse,
} from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { paymentsApi, type PaymentsApi } from '../payments/payments-api';
import { formatAmdFromCents } from '../sessions/session-format';
import { walletApi, type WalletApi } from './wallet-api';

/** Top-up presets expressed in whole drams (converted to AMD cents on submit). */
const TOP_UP_PRESET_DRAMS: readonly number[] = [1000, 2000, 5000, 10000];
const MIN_TOP_UP_CENTS = 100;
const MAX_TOP_UP_CENTS = 1_000_000;

type WalletScreenState =
  | { readonly status: 'error' }
  | {
      readonly status: 'loaded';
      readonly methods: readonly PaymentMethodResponse[];
      readonly transactions: readonly WalletTransactionResponse[];
      readonly wallet: WalletResponse;
    }
  | { readonly status: 'loading' };

interface WalletScreenProps {
  readonly paymentsApiClient?: Pick<PaymentsApi, 'listPaymentMethods'>;
  readonly walletApiClient?: WalletApi;
}

/**
 * Wallet screen: AMD balance card, top-up form with amount presets and stored
 * payment-method selector, and the recent transactions ledger.
 */
export function WalletScreen({
  paymentsApiClient = paymentsApi,
  walletApiClient = walletApi,
}: WalletScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [screenState, setScreenState] = useState<WalletScreenState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedPresetDrams, setSelectedPresetDrams] = useState<number>(TOP_UP_PRESET_DRAMS[0]);
  const [customAmountDrams, setCustomAmountDrams] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [isTopUpSuccessVisible, setIsTopUpSuccessVisible] = useState(false);

  useEffect(() => {
    if (userId === null) {
      return;
    }

    let isCancelled = false;

    setScreenState({ status: 'loading' });
    Promise.all([
      walletApiClient.getWallet(userId),
      walletApiClient.listTransactions(userId),
      paymentsApiClient.listPaymentMethods(userId),
    ])
      .then(([wallet, transactionsPage, methods]): void => {
        if (isCancelled) {
          return;
        }

        const eligibleMethods = methods.filter(isTopUpEligibleMethod);

        setScreenState({
          methods: eligibleMethods,
          status: 'loaded',
          transactions: transactionsPage.transactions,
          wallet,
        });
        setSelectedMethodId((previousMethodId) => {
          if (
            previousMethodId !== null &&
            eligibleMethods.some((method) => method.id === previousMethodId)
          ) {
            return previousMethodId;
          }

          return (
            eligibleMethods.find((method) => method.isDefault)?.id ??
            eligibleMethods[0]?.id ??
            null
          );
        });
      })
      .catch((): void => {
        if (!isCancelled) {
          setScreenState({ status: 'error' });
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [paymentsApiClient, reloadToken, userId, walletApiClient]);

  /**
   * Resolves the requested top-up amount in AMD cents, or null when invalid.
   */
  const resolveTopUpAmountCents = (): number | null => {
    const normalizedCustomAmount = customAmountDrams.trim();
    const amountDrams =
      normalizedCustomAmount.length > 0 ? Number(normalizedCustomAmount) : selectedPresetDrams;

    if (!Number.isInteger(amountDrams) || amountDrams <= 0) {
      return null;
    }

    const amountCents = amountDrams * 100;

    if (amountCents < MIN_TOP_UP_CENTS || amountCents > MAX_TOP_UP_CENTS) {
      return null;
    }

    return amountCents;
  };

  /**
   * Submits one wallet top-up through the selected stored payment method.
   */
  const handleTopUp = (): void => {
    if (userId === null || screenState.status !== 'loaded' || isSubmitting) {
      return;
    }

    setIsTopUpSuccessVisible(false);

    const amountCents = resolveTopUpAmountCents();

    if (amountCents === null) {
      setTopUpError(t('wallet.topUp.errors.invalidAmount'));

      return;
    }

    const selectedMethod = screenState.methods.find((method) => method.id === selectedMethodId);

    if (!selectedMethod) {
      setTopUpError(t('wallet.topUp.errors.methodRequired'));

      return;
    }

    setTopUpError(null);
    setIsSubmitting(true);
    walletApiClient
      .topUp(userId, {
        amount: amountCents,
        gateway: selectedMethod.gateway === 'IDRAM' ? 'IDRAM' : 'ARCA',
        paymentMethodId: selectedMethod.id,
      })
      .then((topUpResult: WalletTopUpResponse): void => {
        setIsSubmitting(false);
        setCustomAmountDrams('');
        setIsTopUpSuccessVisible(true);
        setScreenState((previousState) => {
          if (previousState.status !== 'loaded') {
            return previousState;
          }

          return {
            ...previousState,
            transactions: [topUpResult.transaction, ...previousState.transactions],
            wallet: { ...previousState.wallet, balance: topUpResult.newBalance },
          };
        });
      })
      .catch((): void => {
        setIsSubmitting(false);
        setTopUpError(t('wallet.topUp.errors.topUpFailed'));
      });
  };

  if (userId === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.mutedText} testID="wallet-signed-out">
          {t('wallet.signedOut.message')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="wallet-sign-in"
        >
          <Text style={styles.primaryButtonText}>{t('wallet.signedOut.signIn')}</Text>
        </Pressable>
      </View>
    );
  }

  if (screenState.status === 'loading') {
    return (
      <View style={styles.centeredContainer} testID="wallet-loading">
        <ActivityIndicator color="#0F766E" size="large" />
        <Text style={styles.mutedText}>{t('wallet.loading')}</Text>
      </View>
    );
  }

  if (screenState.status === 'error') {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="wallet-error">
          {t('wallet.loadError')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            setReloadToken((previousToken) => previousToken + 1);
          }}
          style={({ pressed }) => {
            return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="wallet-retry"
        >
          <Text style={styles.secondaryButtonText}>{t('wallet.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const { methods, transactions, wallet } = screenState;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
      testID="wallet-screen"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t('wallet.title')}
      </Text>
      <Text style={styles.subtitle}>{t('wallet.subtitle')}</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('wallet.balanceTitle')}</Text>
        <Text style={styles.balanceValue} testID="wallet-balance">
          {t('sessions.units.amd', { amount: formatAmdFromCents(wallet.balance) })}
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('wallet.topUp.title')}</Text>

        {methods.length === 0 ? (
          <>
            <Text style={styles.mutedText} testID="wallet-no-methods">
              {t('wallet.topUp.noMethods')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={(): void => {
                router.push('/payment-methods');
              }}
              style={({ pressed }) => {
                return [styles.primaryButton, pressed ? styles.buttonPressed : null];
              }}
              testID="wallet-add-method"
            >
              <Text style={styles.primaryButtonText}>{t('wallet.topUp.addMethod')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.presetRow}>
              {TOP_UP_PRESET_DRAMS.map((presetDrams) => {
                const isSelected =
                  customAmountDrams.trim().length === 0 && selectedPresetDrams === presetDrams;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={presetDrams}
                    onPress={(): void => {
                      setSelectedPresetDrams(presetDrams);
                      setCustomAmountDrams('');
                    }}
                    style={({ pressed }) => {
                      return [
                        styles.presetOption,
                        isSelected ? styles.presetOptionSelected : null,
                        pressed ? styles.buttonPressed : null,
                      ];
                    }}
                    testID={`wallet-topup-preset-${presetDrams}`}
                  >
                    <Text
                      style={[
                        styles.presetOptionText,
                        isSelected ? styles.presetOptionTextSelected : null,
                      ]}
                    >
                      {t('sessions.units.amd', { amount: String(presetDrams) })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{t('wallet.topUp.customAmountLabel')}</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setCustomAmountDrams}
              placeholder={t('wallet.topUp.customAmountPlaceholder')}
              style={styles.textInput}
              testID="wallet-topup-custom-input"
              value={customAmountDrams}
            />

            <Text style={styles.fieldLabel}>{t('wallet.topUp.methodLabel')}</Text>
            {methods.map((method) => {
              const isSelected = selectedMethodId === method.id;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={method.id}
                  onPress={(): void => {
                    setSelectedMethodId(method.id);
                  }}
                  style={({ pressed }) => {
                    return [
                      styles.methodOption,
                      isSelected ? styles.methodOptionSelected : null,
                      pressed ? styles.buttonPressed : null,
                    ];
                  }}
                  testID={`wallet-topup-method-${method.id}`}
                >
                  <Text
                    style={[
                      styles.methodOptionText,
                      isSelected ? styles.methodOptionTextSelected : null,
                    ]}
                  >
                    {method.displayLabel ?? t(`payments.gateways.${method.gateway}`)}
                    {method.last4 !== null ? ` · •••• ${method.last4}` : ''}
                  </Text>
                </Pressable>
              );
            })}

            {topUpError !== null ? (
              <Text style={styles.errorText} testID="wallet-topup-error">
                {topUpError}
              </Text>
            ) : null}
            {isTopUpSuccessVisible ? (
              <Text style={styles.successText} testID="wallet-topup-success">
                {t('wallet.topUp.success')}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleTopUp}
              style={({ pressed }) => {
                return [styles.primaryButton, pressed ? styles.buttonPressed : null];
              }}
              testID="wallet-topup-submit"
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? t('wallet.topUp.submitting') : t('wallet.topUp.submit')}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('wallet.transactions.title')}</Text>
        {transactions.length === 0 ? (
          <Text style={styles.mutedText} testID="wallet-transactions-empty">
            {t('wallet.transactions.empty')}
          </Text>
        ) : null}
        {transactions.map((transaction) => (
          <View
            key={transaction.id}
            style={styles.transactionRow}
            testID={`wallet-transaction-${transaction.id}`}
          >
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionType}>
                {t(`wallet.transactions.types.${transaction.type}`)}
              </Text>
              <Text style={styles.mutedText}>{formatTransactionDate(transaction.createdAt)}</Text>
            </View>
            <Text
              style={[
                styles.transactionAmount,
                transaction.type === 'DEDUCTION'
                  ? styles.transactionAmountNegative
                  : styles.transactionAmountPositive,
              ]}
            >
              {transaction.type === 'DEDUCTION' ? '-' : '+'}
              {t('sessions.units.amd', { amount: formatAmdFromCents(transaction.amount) })}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * Keeps only stored methods that can fund a wallet top-up (ArCa or Idram).
 */
function isTopUpEligibleMethod(method: PaymentMethodResponse): boolean {
  return method.gateway === 'ARCA' || method.gateway === 'IDRAM';
}

/**
 * Formats one ISO timestamp as its locale-independent date part (YYYY-MM-DD).
 */
function formatTransactionDate(createdAt: string): string {
  return createdAt.slice(0, 10);
}

const styles = StyleSheet.create({
  balanceCard: {
    backgroundColor: '#0F766E',
    borderRadius: 14,
    padding: 20,
  },
  balanceLabel: {
    color: '#CCFBF1',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  centeredContainer: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  fieldLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    textTransform: 'uppercase',
  },
  methodOption: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  methodOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0F766E',
  },
  methodOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  methodOptionTextSelected: {
    color: '#065F46',
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 6,
  },
  presetOption: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0F766E',
  },
  presetOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  presetOptionTextSelected: {
    color: '#065F46',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    padding: 16,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#0F766E',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#374151',
    fontSize: 15,
  },
  successText: {
    color: '#065F46',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 14,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  transactionAmountNegative: {
    color: '#991B1B',
  },
  transactionAmountPositive: {
    color: '#065F46',
  },
  transactionInfo: {
    flexShrink: 1,
  },
  transactionRow: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  transactionType: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
});
