import type {
  PaymentMethodResponse,
  WalletResponse,
  WalletTopUpResponse,
  WalletTransactionResponse,
} from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
import { LoadingView } from '../../components/ui/state-views';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { NEUTRAL_500 } from '../../theme/colors';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { paymentsApi, type PaymentsApi } from '../payments/payments-api';
import { formatAmdFromCents } from '../sessions/session-format';
import { walletApi, type WalletApi } from './wallet-api';

const CENTERED_CLASS = 'flex-1 items-center justify-center gap-3 bg-background px-6';
const FIELD_LABEL_CLASS = 'mt-3 text-xs font-bold uppercase text-text-muted';
const TEXT_INPUT_CLASS =
  'mt-1.5 min-h-11 rounded-sm border border-border bg-neutral-50 px-3 py-2.5 text-sm text-text';
const OPTION_CLASS = 'rounded-sm border border-border bg-neutral-50 px-3 py-2.5';
const OPTION_SELECTED_CLASS = 'border-primary bg-primary-50';
const OPTION_TEXT_CLASS = 'text-sm font-semibold text-text';
const OPTION_TEXT_SELECTED_CLASS = 'text-sm font-semibold text-primary-900';

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
      <View className={CENTERED_CLASS}>
        <Text className="text-[13px] text-text-muted" testID="wallet-signed-out">
          {t('wallet.signedOut.message')}
        </Text>
        <Button
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          testID="wallet-sign-in"
          title={t('wallet.signedOut.signIn')}
        />
      </View>
    );
  }

  if (screenState.status === 'loading') {
    return <LoadingView message={t('wallet.loading')} testID="wallet-loading" />;
  }

  if (screenState.status === 'error') {
    return (
      <View className={CENTERED_CLASS}>
        <Text className="text-center text-sm font-semibold text-danger" testID="wallet-error">
          {t('wallet.loadError')}
        </Text>
        <Button
          onPress={(): void => {
            setReloadToken((previousToken) => previousToken + 1);
          }}
          testID="wallet-retry"
          title={t('wallet.retry')}
          variant="secondary"
        />
      </View>
    );
  }

  const { methods, transactions, wallet } = screenState;

  return (
    <ScreenContainer scroll testID="wallet-screen">
      <View className="gap-3 p-4">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('wallet.title')}
        </Text>
        <Text className="text-[15px] text-neutral-700">{t('wallet.subtitle')}</Text>

        <View className="rounded-lg bg-primary p-5">
          <Text className="text-[13px] font-semibold uppercase text-primary-100">
            {t('wallet.balanceTitle')}
          </Text>
          <Text className="mt-1.5 text-[32px] font-bold text-neutral-0" testID="wallet-balance">
            {t('sessions.units.amd', { amount: formatAmdFromCents(wallet.balance) })}
          </Text>
        </View>

        <Card>
          <Text className="text-[15px] font-bold text-text">{t('wallet.topUp.title')}</Text>

          {methods.length === 0 ? (
            <>
              <Text className="mt-1.5 text-[13px] text-text-muted" testID="wallet-no-methods">
                {t('wallet.topUp.noMethods')}
              </Text>
              <Button
                className="mt-3"
                onPress={(): void => {
                  router.push('/payment-methods');
                }}
                testID="wallet-add-method"
                title={t('wallet.topUp.addMethod')}
              />
            </>
          ) : (
            <>
              <View className="mt-2.5 flex-row flex-wrap gap-2">
                {TOP_UP_PRESET_DRAMS.map((presetDrams) => {
                  const isSelected =
                    customAmountDrams.trim().length === 0 && selectedPresetDrams === presetDrams;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      className={`${OPTION_CLASS} ${isSelected ? OPTION_SELECTED_CLASS : ''} active:opacity-75`}
                      key={presetDrams}
                      onPress={(): void => {
                        setSelectedPresetDrams(presetDrams);
                        setCustomAmountDrams('');
                      }}
                      testID={`wallet-topup-preset-${presetDrams}`}
                    >
                      <Text
                        className={isSelected ? OPTION_TEXT_SELECTED_CLASS : OPTION_TEXT_CLASS}
                      >
                        {t('sessions.units.amd', { amount: String(presetDrams) })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className={FIELD_LABEL_CLASS}>{t('wallet.topUp.customAmountLabel')}</Text>
              <TextInput
                className={TEXT_INPUT_CLASS}
                keyboardType="number-pad"
                onChangeText={setCustomAmountDrams}
                placeholder={t('wallet.topUp.customAmountPlaceholder')}
                placeholderTextColor={NEUTRAL_500}
                testID="wallet-topup-custom-input"
                value={customAmountDrams}
              />

              <Text className={FIELD_LABEL_CLASS}>{t('wallet.topUp.methodLabel')}</Text>
              {methods.map((method) => {
                const isSelected = selectedMethodId === method.id;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`mt-2 ${OPTION_CLASS} ${isSelected ? OPTION_SELECTED_CLASS : ''} active:opacity-75`}
                    key={method.id}
                    onPress={(): void => {
                      setSelectedMethodId(method.id);
                    }}
                    testID={`wallet-topup-method-${method.id}`}
                  >
                    <Text className={isSelected ? OPTION_TEXT_SELECTED_CLASS : OPTION_TEXT_CLASS}>
                      {method.displayLabel ?? t(`payments.gateways.${method.gateway}`)}
                      {method.last4 !== null ? ` · •••• ${method.last4}` : ''}
                    </Text>
                  </Pressable>
                );
              })}

              {topUpError !== null ? (
                <Text
                  className="mt-2.5 text-sm font-semibold text-danger"
                  testID="wallet-topup-error"
                >
                  {topUpError}
                </Text>
              ) : null}
              {isTopUpSuccessVisible ? (
                <Text
                  className="mt-2.5 text-sm font-semibold text-primary-900"
                  testID="wallet-topup-success"
                >
                  {t('wallet.topUp.success')}
                </Text>
              ) : null}

              <Button
                className="mt-3"
                disabled={isSubmitting}
                onPress={handleTopUp}
                testID="wallet-topup-submit"
                title={isSubmitting ? t('wallet.topUp.submitting') : t('wallet.topUp.submit')}
              />
            </>
          )}
        </Card>

        <Card>
          <Text className="text-[15px] font-bold text-text">{t('wallet.transactions.title')}</Text>
          {transactions.length === 0 ? (
            <Text
              className="mt-1.5 text-[13px] text-text-muted"
              testID="wallet-transactions-empty"
            >
              {t('wallet.transactions.empty')}
            </Text>
          ) : null}
          {transactions.map((transaction) => (
            <View
              className="mt-2.5 flex-row items-center justify-between rounded-md border border-border bg-neutral-50 px-3 py-2.5"
              key={transaction.id}
              testID={`wallet-transaction-${transaction.id}`}
            >
              <View className="shrink">
                <Text className="text-sm font-bold text-text">
                  {t(`wallet.transactions.types.${transaction.type}`)}
                </Text>
                <Text className="mt-0.5 text-[13px] text-text-muted">
                  {formatTransactionDate(transaction.createdAt)}
                </Text>
              </View>
              <Text
                className={`text-sm font-bold ${
                  transaction.type === 'DEDUCTION' ? 'text-danger' : 'text-primary-900'
                }`}
              >
                {transaction.type === 'DEDUCTION' ? '-' : '+'}
                {t('sessions.units.amd', { amount: formatAmdFromCents(transaction.amount) })}
              </Text>
            </View>
          ))}
        </Card>
      </View>
    </ScreenContainer>
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
