import type {
  StationConnectorResponse,
  StationDetailResponse,
  StationPricingPlanResponse,
} from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { stationsApi, type StationsApi } from '../stations/stations-api';
import { sessionsApi, type SessionsApi } from './sessions-api';

type StationDetailState =
  | { readonly status: 'error' }
  | { readonly status: 'idle' }
  | { readonly status: 'loaded'; readonly detail: StationDetailResponse }
  | { readonly status: 'loading' };

interface ChargeConfirmScreenProps {
  readonly sessionsApiClient?: Pick<SessionsApi, 'createSession' | 'startSession'>;
  readonly stationsApiClient?: Pick<StationsApi, 'getStationDetail'>;
}

/**
 * Confirmation step of the two-tap charging flow: shows the target connector
 * and starts a charging session with one primary action.
 */
export function ChargeConfirmScreen({
  sessionsApiClient = sessionsApi,
  stationsApiClient = stationsApi,
}: ChargeConfirmScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ connectorId?: string; stationId?: string }>();
  const connectorId = normalizeRouteParam(params.connectorId);
  const stationId = normalizeRouteParam(params.stationId);
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [stationDetailState, setStationDetailState] = useState<StationDetailState>({
    status: 'idle',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startErrorKey, setStartErrorKey] = useState<string | null>(null);
  const createdSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (stationId === null) {
      setStationDetailState({ status: 'idle' });

      return;
    }

    let isCancelled = false;

    setStationDetailState({ status: 'loading' });
    stationsApiClient
      .getStationDetail(stationId)
      .then((detail: StationDetailResponse): void => {
        if (!isCancelled) {
          setStationDetailState({ detail, status: 'loaded' });
        }
      })
      .catch((): void => {
        if (!isCancelled) {
          setStationDetailState({ status: 'error' });
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [stationId, stationsApiClient]);

  /**
   * Creates the pending session (once) and starts it, then opens live monitoring.
   */
  const handleStartCharging = async (): Promise<void> => {
    if (connectorId === null || userId === null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setStartErrorKey(null);

    try {
      if (createdSessionIdRef.current === null) {
        const session = await sessionsApiClient.createSession(userId, { connectorId });

        createdSessionIdRef.current = session.id;
      }

      const startedSession = await sessionsApiClient.startSession(
        userId,
        createdSessionIdRef.current,
      );

      router.replace(`/sessions/${startedSession.id}`);
    } catch (error: unknown) {
      setStartErrorKey(resolveStartErrorKey(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (connectorId === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="confirm-missing-connector">
          {t('sessions.confirm.errors.missingConnector')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/(tabs)/charge');
          }}
          style={({ pressed }) => {
            return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="confirm-rescan"
        >
          <Text style={styles.secondaryButtonText}>{t('sessions.actions.rescan')}</Text>
        </Pressable>
      </View>
    );
  }

  if (userId === null) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="confirm-unauthenticated">
          {t('sessions.confirm.errors.unauthenticated')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          style={({ pressed }) => {
            return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="confirm-sign-in"
        >
          <Text style={styles.secondaryButtonText}>{t('sessions.actions.signIn')}</Text>
        </Pressable>
      </View>
    );
  }

  const matchedConnector =
    stationDetailState.status === 'loaded'
      ? findConnectorById(connectorId, stationDetailState.detail.connectors)
      : null;
  const matchedPricingPlan =
    stationDetailState.status === 'loaded'
      ? findPricingPlanByConnectorId(connectorId, stationDetailState.detail.pricingPlans)
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('sessions.confirm.title')}
        </Text>
        <Text style={styles.subtitle}>{t('sessions.confirm.subtitle')}</Text>
      </View>

      <View style={styles.card} testID="confirm-target">
        {stationDetailState.status === 'loading' ? (
          <Text style={styles.mutedText}>{t('sessions.confirm.stationLoading')}</Text>
        ) : null}
        {stationDetailState.status === 'error' ? (
          <Text style={styles.mutedText} testID="confirm-station-error">
            {t('sessions.confirm.stationError')}
          </Text>
        ) : null}

        {stationDetailState.status === 'loaded' ? (
          <View testID="confirm-station-detail">
            <Text style={styles.fieldLabel}>{t('sessions.confirm.stationLabel')}</Text>
            <Text style={styles.stationName}>{stationDetailState.detail.name}</Text>
            <Text style={styles.mutedText}>
              {stationDetailState.detail.address}, {stationDetailState.detail.city}
            </Text>
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>{t('sessions.confirm.connectorLabel')}</Text>
        {matchedConnector === null ? (
          <View>
            <Text style={styles.connectorValue} testID="confirm-connector-generic">
              {t('sessions.confirm.connectorGeneric', { connectorId })}
            </Text>
            <Text style={styles.mutedText}>{t('sessions.confirm.genericMessage')}</Text>
          </View>
        ) : (
          <View testID="confirm-connector-detail">
            <Text style={styles.connectorValue}>
              {t(`onboarding.vehicle.connectorTypes.${matchedConnector.connectorType}`)} ·{' '}
              {matchedConnector.powerKw} kW
            </Text>
            <Text style={styles.mutedText}>
              {t('sessions.confirm.pricingLabel')}: {formatPricingDetails(matchedPricingPlan, t)}
            </Text>
          </View>
        )}
      </View>

      {startErrorKey !== null ? (
        <View style={styles.errorContainer} testID="confirm-error">
          <Text style={styles.errorText}>{t(startErrorKey)}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              void handleStartCharging();
            }}
            style={({ pressed }) => {
              return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID="confirm-retry"
          >
            <Text style={styles.secondaryButtonText}>{t('sessions.actions.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.footerContainer}>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={(): void => {
            void handleStartCharging();
          }}
          style={({ pressed }) => {
            return [
              styles.primaryButton,
              pressed || isSubmitting ? styles.buttonPressed : null,
            ];
          }}
          testID="confirm-start"
        >
          {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? t('sessions.confirm.starting') : t('sessions.confirm.start')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Normalizes one expo-router search param into a trimmed string or null.
 */
function normalizeRouteParam(value: string | string[] | undefined): string | null {
  const singleValue = Array.isArray(value) ? value[0] : value;
  const normalizedValue = singleValue?.trim() ?? '';

  return normalizedValue.length > 0 ? normalizedValue : null;
}

/**
 * Finds the scanned connector inside one station detail payload.
 */
function findConnectorById(
  connectorId: string,
  connectors: readonly StationConnectorResponse[],
): StationConnectorResponse | null {
  return (
    connectors.find(
      (connector) => connector.id.toLowerCase() === connectorId.toLowerCase(),
    ) ?? null
  );
}

/**
 * Finds the first pricing plan linked to the scanned connector.
 */
function findPricingPlanByConnectorId(
  connectorId: string,
  pricingPlans: readonly StationPricingPlanResponse[],
): StationPricingPlanResponse | null {
  return (
    pricingPlans.find(
      (pricingPlan) => pricingPlan.connectorId.toLowerCase() === connectorId.toLowerCase(),
    ) ?? null
  );
}

/**
 * Converts available pricing dimensions into a compact label string.
 */
function formatPricingDetails(
  pricingPlan: StationPricingPlanResponse | null,
  t: (key: string, options?: Readonly<Record<string, string>>) => string,
): string {
  if (pricingPlan === null) {
    return t('stations.map.sheet.noPricing');
  }

  const pricingTokens: string[] = [];

  if (pricingPlan.pricePerKwh !== null) {
    pricingTokens.push(
      t('stations.map.sheet.pricingPerKwh', { amount: formatDramAmount(pricingPlan.pricePerKwh) }),
    );
  }

  if (pricingPlan.pricePerMinute !== null) {
    pricingTokens.push(
      t('stations.map.sheet.pricingPerMinute', {
        amount: formatDramAmount(pricingPlan.pricePerMinute),
      }),
    );
  }

  if (pricingPlan.sessionFee !== null) {
    pricingTokens.push(
      t('stations.map.sheet.pricingSessionFee', {
        amount: formatDramAmount(pricingPlan.sessionFee),
      }),
    );
  }

  return pricingTokens.length > 0 ? pricingTokens.join(' · ') : t('stations.map.sheet.noPricing');
}

/**
 * Formats numeric values into Armenian dram strings.
 */
function formatDramAmount(value: number): string {
  return Number.isInteger(value) ? `${value} ֏` : `${value.toFixed(2)} ֏`;
}

/**
 * Maps start-charging failures to localized error message keys.
 */
function resolveStartErrorKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 409) {
      return 'sessions.confirm.errors.connectorUnavailable';
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      return 'sessions.confirm.errors.unauthenticated';
    }
  }

  return 'sessions.confirm.errors.startFailed';
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.75,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    margin: 16,
    padding: 16,
  },
  centeredContainer: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  connectorValue: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  errorContainer: {
    alignItems: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    marginHorizontal: 16,
    padding: 14,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  fieldLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  footerContainer: {
    marginTop: 'auto',
    padding: 16,
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  mutedText: {
    color: '#4B5563',
    fontSize: 13,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
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
  stationName: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 14,
    marginTop: 6,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
