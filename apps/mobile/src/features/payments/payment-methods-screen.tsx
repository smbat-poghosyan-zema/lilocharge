import type {
  PaymentGatewayCode,
  PaymentMethodResponse,
  TokenizedPaymentGatewayCode,
} from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
import { StatusBadge } from '../../components/ui/status-badge';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { NEUTRAL_500, PRIMARY } from '../../theme/colors';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { paymentsApi, type PaymentsApi } from './payments-api';

const TOKENIZED_GATEWAYS: readonly TokenizedPaymentGatewayCode[] = ['ARCA', 'IDRAM'];

const CENTERED_CLASS = 'flex-1 items-center justify-center gap-3 bg-background px-6';
const FIELD_LABEL_CLASS = 'mt-3 text-xs font-bold uppercase text-text-muted';
const TEXT_INPUT_CLASS =
  'mt-1.5 min-h-11 rounded-sm border border-border bg-neutral-50 px-3 py-2.5 text-sm text-text';
const OPTION_CLASS = 'rounded-sm border border-border bg-neutral-50 px-3 py-2.5';
const OPTION_SELECTED_CLASS = 'border-primary bg-primary-50';
const OPTION_TEXT_CLASS = 'text-sm font-semibold text-text';
const OPTION_TEXT_SELECTED_CLASS = 'text-sm font-semibold text-primary-900';

type PaymentMethodsState =
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly methods: readonly PaymentMethodResponse[] }
  | { readonly status: 'loading' };

interface PaymentMethodsScreenProps {
  readonly paymentsApiClient?: PaymentsApi;
}

/**
 * Payment methods management screen: lists stored ArCa/Idram/wallet methods,
 * registers new tokenized methods, deletes methods, and sets the default.
 */
export function PaymentMethodsScreen({
  paymentsApiClient = paymentsApi,
}: PaymentMethodsScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [methodsState, setMethodsState] = useState<PaymentMethodsState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [gateway, setGateway] = useState<TokenizedPaymentGatewayCode>('ARCA');
  const [token, setToken] = useState('');
  const [displayLabel, setDisplayLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (userId === null) {
      return;
    }

    let isCancelled = false;

    setMethodsState({ status: 'loading' });
    paymentsApiClient
      .listPaymentMethods(userId)
      .then((methods: PaymentMethodResponse[]): void => {
        if (!isCancelled) {
          setMethodsState({ methods, status: 'loaded' });
        }
      })
      .catch((): void => {
        if (!isCancelled) {
          setMethodsState({ status: 'error' });
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [paymentsApiClient, reloadToken, userId]);

  /**
   * Triggers a payment-method list refetch after mutations or errors.
   */
  const reloadMethods = (): void => {
    setReloadToken((previousToken) => previousToken + 1);
  };

  /**
   * Registers the entered tokenized payment method and refreshes the list.
   */
  const handleRegisterMethod = (): void => {
    if (userId === null || isSubmitting) {
      return;
    }

    const normalizedToken = token.trim();

    if (normalizedToken.length === 0) {
      setFormError(t('payments.add.errors.tokenRequired'));

      return;
    }

    const normalizedDisplayLabel = displayLabel.trim();

    setFormError(null);
    setIsSubmitting(true);
    paymentsApiClient
      .registerPaymentMethod(userId, {
        displayLabel: normalizedDisplayLabel.length > 0 ? normalizedDisplayLabel : undefined,
        gateway,
        token: normalizedToken,
      })
      .then((): void => {
        setIsSubmitting(false);
        setIsFormVisible(false);
        setToken('');
        setDisplayLabel('');
        reloadMethods();
      })
      .catch((): void => {
        setIsSubmitting(false);
        setFormError(t('payments.add.errors.submitFailed'));
      });
  };

  /**
   * Asks for confirmation, then deletes one stored payment method.
   */
  const handleDeleteMethod = (methodId: string): void => {
    if (userId === null) {
      return;
    }

    Alert.alert(t('payments.deleteConfirm.title'), t('payments.deleteConfirm.message'), [
      {
        style: 'cancel',
        text: t('payments.deleteConfirm.cancel'),
      },
      {
        onPress: (): void => {
          setActionError(null);
          paymentsApiClient
            .deletePaymentMethod(userId, methodId)
            .then((): void => {
              reloadMethods();
            })
            .catch((): void => {
              setActionError(t('payments.errors.deleteFailed'));
            });
        },
        style: 'destructive',
        text: t('payments.deleteConfirm.confirm'),
      },
    ]);
  };

  /**
   * Marks one stored payment method as the account default.
   */
  const handleSetDefaultMethod = (methodId: string): void => {
    if (userId === null) {
      return;
    }

    setActionError(null);
    paymentsApiClient
      .setDefaultPaymentMethod(userId, methodId)
      .then((): void => {
        reloadMethods();
      })
      .catch((): void => {
        setActionError(t('payments.errors.setDefaultFailed'));
      });
  };

  if (userId === null) {
    return (
      <View className={CENTERED_CLASS}>
        <Text className="text-[13px] text-text-muted" testID="payment-methods-signed-out">
          {t('payments.signedOut.message')}
        </Text>
        <Button
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          testID="payment-methods-sign-in"
          title={t('payments.signedOut.signIn')}
        />
      </View>
    );
  }

  return (
    <ScreenContainer scroll testID="payment-methods-screen">
      <View className="gap-3 p-4">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('payments.title')}
        </Text>
        <Text className="text-[15px] text-neutral-700">{t('payments.subtitle')}</Text>

        {actionError !== null ? (
          <Text
            className="text-sm font-semibold text-danger"
            testID="payment-methods-action-error"
          >
            {actionError}
          </Text>
        ) : null}

        {methodsState.status === 'loading' ? (
          <Card testID="payment-methods-loading">
            <ActivityIndicator color={PRIMARY} />
            <Text className="mt-1.5 text-[13px] text-text-muted">{t('payments.loading')}</Text>
          </Card>
        ) : null}

        {methodsState.status === 'error' ? (
          <Card>
            <Text className="text-sm font-semibold text-danger" testID="payment-methods-error">
              {t('payments.loadError')}
            </Text>
            <Button
              className="mt-3 self-start"
              onPress={reloadMethods}
              testID="payment-methods-retry"
              title={t('payments.retry')}
              variant="secondary"
            />
          </Card>
        ) : null}

        {methodsState.status === 'loaded' ? (
          <Card>
            {methodsState.methods.length === 0 ? (
              <Text className="text-[13px] text-text-muted" testID="payment-methods-empty">
                {t('payments.empty')}
              </Text>
            ) : null}
            {methodsState.methods.map((method) => (
              <PaymentMethodRow
                key={method.id}
                method={method}
                onDelete={handleDeleteMethod}
                onSetDefault={handleSetDefaultMethod}
              />
            ))}
          </Card>
        ) : null}

        <Card>
          {!isFormVisible ? (
            <Button
              onPress={(): void => {
                setIsFormVisible(true);
              }}
              testID="payment-methods-add-toggle"
              title={t('payments.add.toggle')}
            />
          ) : (
            <View testID="payment-methods-add-form">
              <Text className="text-[15px] font-bold text-text">{t('payments.add.title')}</Text>

              <Text className={FIELD_LABEL_CLASS}>{t('payments.add.gatewayLabel')}</Text>
              <View className="mt-2 flex-row gap-2">
                {TOKENIZED_GATEWAYS.map((gatewayOption) => {
                  const isSelected = gateway === gatewayOption;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      className={`${OPTION_CLASS} ${isSelected ? OPTION_SELECTED_CLASS : ''} active:opacity-75`}
                      key={gatewayOption}
                      onPress={(): void => {
                        setGateway(gatewayOption);
                      }}
                      testID={`payment-methods-gateway-${gatewayOption}`}
                    >
                      <Text
                        className={isSelected ? OPTION_TEXT_SELECTED_CLASS : OPTION_TEXT_CLASS}
                      >
                        {t(`payments.gateways.${gatewayOption}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className={FIELD_LABEL_CLASS}>{t('payments.add.tokenLabel')}</Text>
              <Text className="mt-1 text-xs text-text-muted">{t('payments.add.tokenHelp')}</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                className={TEXT_INPUT_CLASS}
                onChangeText={setToken}
                placeholderTextColor={NEUTRAL_500}
                testID="payment-methods-token-input"
                value={token}
              />

              <Text className={FIELD_LABEL_CLASS}>{t('payments.add.displayLabelLabel')}</Text>
              <TextInput
                className={TEXT_INPUT_CLASS}
                onChangeText={setDisplayLabel}
                placeholder={t('payments.add.displayLabelPlaceholder')}
                placeholderTextColor={NEUTRAL_500}
                testID="payment-methods-label-input"
                value={displayLabel}
              />

              {formError !== null ? (
                <Text
                  className="mt-2 text-sm font-semibold text-danger"
                  testID="payment-methods-form-error"
                >
                  {formError}
                </Text>
              ) : null}

              <Button
                className="mt-3"
                disabled={isSubmitting}
                onPress={handleRegisterMethod}
                testID="payment-methods-submit"
                title={isSubmitting ? t('payments.add.submitting') : t('payments.add.submit')}
              />
              <Button
                className="mt-3"
                onPress={(): void => {
                  setIsFormVisible(false);
                  setFormError(null);
                }}
                testID="payment-methods-add-cancel"
                title={t('payments.add.cancel')}
                variant="secondary"
              />
            </View>
          )}
        </Card>
      </View>
    </ScreenContainer>
  );
}

interface PaymentMethodRowProps {
  readonly method: PaymentMethodResponse;
  readonly onDelete: (methodId: string) => void;
  readonly onSetDefault: (methodId: string) => void;
}

/**
 * Renders one stored payment method row with gateway badge, labels, default
 * badge, and set-default/delete actions.
 */
function PaymentMethodRow({ method, onDelete, onSetDefault }: PaymentMethodRowProps): JSX.Element {
  const { t } = useAppTranslation();
  const gatewayLabel = t(`payments.gateways.${method.gateway}`);

  return (
    <View
      className="mt-2.5 rounded-md border border-border bg-neutral-50 px-3 py-2.5"
      testID={`payment-method-${method.id}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5">
          <View
            className={`h-9 w-9 items-center justify-center rounded-sm ${resolveGatewayBadgeClass(
              method.gateway,
            )}`}
          >
            <Text className="text-base font-bold text-neutral-0">{gatewayLabel.slice(0, 1)}</Text>
          </View>
          <View className="shrink">
            <Text className="text-sm font-bold text-text">
              {method.displayLabel ?? gatewayLabel}
            </Text>
            <Text className="mt-0.5 text-[13px] text-text-muted">
              {gatewayLabel}
              {method.last4 !== null ? ` · •••• ${method.last4}` : ''}
            </Text>
          </View>
        </View>
        {method.isDefault ? (
          <StatusBadge
            label={t('payments.defaultBadge')}
            testID={`payment-method-default-badge-${method.id}`}
            variant="primary"
          />
        ) : null}
      </View>
      <View className="flex-row gap-2">
        {!method.isDefault ? (
          <Button
            className="mt-3 self-start"
            onPress={(): void => {
              onSetDefault(method.id);
            }}
            testID={`payment-method-set-default-${method.id}`}
            title={t('payments.makeDefault')}
            variant="secondary"
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          className="mt-3 min-h-11 items-center justify-center self-start rounded-full bg-danger-bg px-4 active:opacity-75"
          onPress={(): void => {
            onDelete(method.id);
          }}
          testID={`payment-method-delete-${method.id}`}
        >
          <Text className="text-sm font-bold text-danger">{t('payments.delete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Maps a payment gateway onto its badge accent background token class.
 */
function resolveGatewayBadgeClass(gateway: PaymentGatewayCode): string {
  switch (gateway) {
    case 'ARCA':
      return 'bg-info';
    case 'IDRAM':
      return 'bg-danger';
    case 'WALLET':
      return 'bg-primary';
    case 'APPLE_PAY':
    case 'GOOGLE_PAY':
    default:
      return 'bg-neutral-900';
  }
}
