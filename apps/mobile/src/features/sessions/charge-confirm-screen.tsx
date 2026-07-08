import type {
  StationConnectorResponse,
  StationDetailResponse,
  StationPricingPlanResponse,
} from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { NEUTRAL_0 } from '../../theme/colors';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { stationsApi, type StationsApi } from '../stations/stations-api';
import { formatDramAmount } from './session-format';
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
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text
          className="text-center text-sm font-semibold text-danger"
          testID="confirm-missing-connector"
        >
          {t('sessions.confirm.errors.missingConnector')}
        </Text>
        <Button
          onPress={(): void => {
            router.replace('/(tabs)/charge');
          }}
          testID="confirm-rescan"
          title={t('sessions.actions.rescan')}
          variant="secondary"
        />
      </View>
    );
  }

  if (userId === null) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text
          className="text-center text-sm font-semibold text-danger"
          testID="confirm-unauthenticated"
        >
          {t('sessions.confirm.errors.unauthenticated')}
        </Text>
        <Button
          onPress={(): void => {
            router.replace('/onboarding/login');
          }}
          testID="confirm-sign-in"
          title={t('sessions.actions.signIn')}
          variant="secondary"
        />
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
    <ScreenContainer>
      <View className="border-b border-border bg-neutral-0 px-[18px] pb-3.5 pt-[22px]">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('sessions.confirm.title')}
        </Text>
        <Text className="mt-1.5 text-sm text-neutral-500">{t('sessions.confirm.subtitle')}</Text>
      </View>

      <Card className="m-4 gap-1" testID="confirm-target">
        {stationDetailState.status === 'loading' ? (
          <Text className="mt-1 text-[13px] text-neutral-500">
            {t('sessions.confirm.stationLoading')}
          </Text>
        ) : null}
        {stationDetailState.status === 'error' ? (
          <Text className="mt-1 text-[13px] text-neutral-500" testID="confirm-station-error">
            {t('sessions.confirm.stationError')}
          </Text>
        ) : null}

        {stationDetailState.status === 'loaded' ? (
          <View testID="confirm-station-detail">
            <Text className="mt-2.5 text-xs font-bold uppercase text-neutral-500">
              {t('sessions.confirm.stationLabel')}
            </Text>
            <Text className="text-[17px] font-bold text-text">
              {stationDetailState.detail.name}
            </Text>
            <Text className="mt-1 text-[13px] text-neutral-500">
              {stationDetailState.detail.address}, {stationDetailState.detail.city}
            </Text>
          </View>
        ) : null}

        <Text className="mt-2.5 text-xs font-bold uppercase text-neutral-500">
          {t('sessions.confirm.connectorLabel')}
        </Text>
        {matchedConnector === null ? (
          <View>
            <Text className="text-[17px] font-bold text-text" testID="confirm-connector-generic">
              {t('sessions.confirm.connectorGeneric', { connectorId })}
            </Text>
            <Text className="mt-1 text-[13px] text-neutral-500">
              {t('sessions.confirm.genericMessage')}
            </Text>
          </View>
        ) : (
          <View testID="confirm-connector-detail">
            <Text className="text-[17px] font-bold text-text">
              {t(`onboarding.vehicle.connectorTypes.${matchedConnector.connectorType}`)} ·{' '}
              {matchedConnector.powerKw} kW
            </Text>
            <Text className="mt-1 text-[13px] text-neutral-500">
              {t('sessions.confirm.pricingLabel')}: {formatPricingDetails(matchedPricingPlan, t)}
            </Text>
          </View>
        )}
      </Card>

      {startErrorKey !== null ? (
        <View className="mx-4 items-start rounded-lg bg-danger-bg p-3.5" testID="confirm-error">
          <Text className="text-center text-sm font-semibold text-danger">{t(startErrorKey)}</Text>
          <Button
            className="mt-3"
            onPress={(): void => {
              void handleStartCharging();
            }}
            testID="confirm-retry"
            title={t('sessions.actions.retry')}
            variant="secondary"
          />
        </View>
      ) : null}

      <View className="mt-auto p-4">
        <Button
          accessibilityLabel={
            isSubmitting ? t('sessions.confirm.starting') : t('sessions.confirm.start')
          }
          className="gap-2"
          disabled={isSubmitting}
          onPress={(): void => {
            void handleStartCharging();
          }}
          testID="confirm-start"
        >
          {isSubmitting ? <ActivityIndicator color={NEUTRAL_0} /> : null}
          <Text className="text-[15px] font-bold text-neutral-0">
            {isSubmitting ? t('sessions.confirm.starting') : t('sessions.confirm.start')}
          </Text>
        </Button>
      </View>
    </ScreenContainer>
  );
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
