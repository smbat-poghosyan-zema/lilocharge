import type {
  PaymentGatewayCode,
  PaymentMethodResponse,
  TokenizedPaymentGatewayCode,
} from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { paymentsApi, type PaymentsApi } from './payments-api';

const TOKENIZED_GATEWAYS: readonly TokenizedPaymentGatewayCode[] = ['ARCA', 'IDRAM'];

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
      <View style={styles.centeredContainer}>
        <Text style={styles.mutedText} testID="payment-methods-signed-out">
          {t('payments.signedOut.message')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="payment-methods-sign-in"
        >
          <Text style={styles.primaryButtonText}>{t('payments.signedOut.signIn')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
      testID="payment-methods-screen"
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t('payments.title')}
      </Text>
      <Text style={styles.subtitle}>{t('payments.subtitle')}</Text>

      {actionError !== null ? (
        <Text style={styles.errorText} testID="payment-methods-action-error">
          {actionError}
        </Text>
      ) : null}

      {methodsState.status === 'loading' ? (
        <View style={styles.sectionCard} testID="payment-methods-loading">
          <ActivityIndicator color="#0F766E" />
          <Text style={styles.mutedText}>{t('payments.loading')}</Text>
        </View>
      ) : null}

      {methodsState.status === 'error' ? (
        <View style={styles.sectionCard}>
          <Text style={styles.errorText} testID="payment-methods-error">
            {t('payments.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={reloadMethods}
            style={({ pressed }) => {
              return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID="payment-methods-retry"
          >
            <Text style={styles.secondaryButtonText}>{t('payments.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {methodsState.status === 'loaded' ? (
        <View style={styles.sectionCard}>
          {methodsState.methods.length === 0 ? (
            <Text style={styles.mutedText} testID="payment-methods-empty">
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
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        {!isFormVisible ? (
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              setIsFormVisible(true);
            }}
            style={({ pressed }) => {
              return [styles.primaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID="payment-methods-add-toggle"
          >
            <Text style={styles.primaryButtonText}>{t('payments.add.toggle')}</Text>
          </Pressable>
        ) : (
          <View testID="payment-methods-add-form">
            <Text style={styles.sectionTitle}>{t('payments.add.title')}</Text>

            <Text style={styles.fieldLabel}>{t('payments.add.gatewayLabel')}</Text>
            <View style={styles.gatewayRow}>
              {TOKENIZED_GATEWAYS.map((gatewayOption) => {
                const isSelected = gateway === gatewayOption;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={gatewayOption}
                    onPress={(): void => {
                      setGateway(gatewayOption);
                    }}
                    style={({ pressed }) => {
                      return [
                        styles.gatewayOption,
                        isSelected ? styles.gatewayOptionSelected : null,
                        pressed ? styles.buttonPressed : null,
                      ];
                    }}
                    testID={`payment-methods-gateway-${gatewayOption}`}
                  >
                    <Text
                      style={[
                        styles.gatewayOptionText,
                        isSelected ? styles.gatewayOptionTextSelected : null,
                      ]}
                    >
                      {t(`payments.gateways.${gatewayOption}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{t('payments.add.tokenLabel')}</Text>
            <Text style={styles.helpText}>{t('payments.add.tokenHelp')}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setToken}
              style={styles.textInput}
              testID="payment-methods-token-input"
              value={token}
            />

            <Text style={styles.fieldLabel}>{t('payments.add.displayLabelLabel')}</Text>
            <TextInput
              onChangeText={setDisplayLabel}
              placeholder={t('payments.add.displayLabelPlaceholder')}
              style={styles.textInput}
              testID="payment-methods-label-input"
              value={displayLabel}
            />

            {formError !== null ? (
              <Text style={styles.errorText} testID="payment-methods-form-error">
                {formError}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleRegisterMethod}
              style={({ pressed }) => {
                return [styles.primaryButton, pressed ? styles.buttonPressed : null];
              }}
              testID="payment-methods-submit"
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? t('payments.add.submitting') : t('payments.add.submit')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={(): void => {
                setIsFormVisible(false);
                setFormError(null);
              }}
              style={({ pressed }) => {
                return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
              }}
              testID="payment-methods-add-cancel"
            >
              <Text style={styles.secondaryButtonText}>{t('payments.add.cancel')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
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
    <View style={styles.methodCard} testID={`payment-method-${method.id}`}>
      <View style={styles.methodHeader}>
        <View style={styles.methodIdentity}>
          <View style={[styles.gatewayBadge, { backgroundColor: resolveGatewayColor(method.gateway) }]}>
            <Text style={styles.gatewayBadgeText}>{gatewayLabel.slice(0, 1)}</Text>
          </View>
          <View style={styles.methodLabels}>
            <Text style={styles.methodTitle}>{method.displayLabel ?? gatewayLabel}</Text>
            <Text style={styles.mutedText}>
              {gatewayLabel}
              {method.last4 !== null ? ` · •••• ${method.last4}` : ''}
            </Text>
          </View>
        </View>
        {method.isDefault ? (
          <View style={styles.defaultBadge} testID={`payment-method-default-badge-${method.id}`}>
            <Text style={styles.defaultBadgeText}>{t('payments.defaultBadge')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.methodActions}>
        {!method.isDefault ? (
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              onSetDefault(method.id);
            }}
            style={({ pressed }) => {
              return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID={`payment-method-set-default-${method.id}`}
          >
            <Text style={styles.secondaryButtonText}>{t('payments.makeDefault')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            onDelete(method.id);
          }}
          style={({ pressed }) => {
            return [styles.deleteButton, pressed ? styles.buttonPressed : null];
          }}
          testID={`payment-method-delete-${method.id}`}
        >
          <Text style={styles.deleteButtonText}>{t('payments.delete')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Maps a payment gateway onto its badge accent color.
 */
function resolveGatewayColor(gateway: PaymentGatewayCode): string {
  switch (gateway) {
    case 'ARCA':
      return '#1D4ED8';
    case 'IDRAM':
      return '#B91C1C';
    case 'WALLET':
      return '#0F766E';
    case 'APPLE_PAY':
    case 'GOOGLE_PAY':
    default:
      return '#111827';
  }
}

const styles = StyleSheet.create({
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
  defaultBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0F766E',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  defaultBadgeText: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  deleteButtonText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  fieldLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    textTransform: 'uppercase',
  },
  gatewayBadge: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  gatewayBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  gatewayOption: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gatewayOptionSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#0F766E',
  },
  gatewayOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  gatewayOptionTextSelected: {
    color: '#065F46',
  },
  gatewayRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  helpText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  methodActions: {
    flexDirection: 'row',
    gap: 8,
  },
  methodCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  methodHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  methodIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  methodLabels: {
    flexShrink: 1,
  },
  methodTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 2,
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
    alignSelf: 'flex-start',
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
});
