import type { SessionMonitorUpdateEvent, SessionResponse } from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
import { StatusBadge } from '../../components/ui/status-badge';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { NEUTRAL_0, PRIMARY } from '../../theme/colors';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import {
  computeDurationSeconds,
  formatAmdFromCents,
  formatDurationSeconds,
  formatEnergyKwh,
  formatPowerKw,
} from './session-format';
import {
  createSessionMonitoringClient,
  type SessionMonitoringClient,
} from './session-monitoring-client';
import { sessionsApi, type SessionsApi } from './sessions-api';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const CLOCK_TICK_MS = 1_000;
const TERMINAL_STATUSES: readonly SessionStatus[] = [
  SessionStatus.CANCELLED,
  SessionStatus.COMPLETED,
  SessionStatus.FAILED,
];

interface ActiveSessionScreenProps {
  readonly monitoringClient?: SessionMonitoringClient;
  readonly pollIntervalMs?: number;
  readonly sessionsApiClient?: Pick<SessionsApi, 'getSession' | 'stopSession'>;
}

/**
 * Live charging session screen: streams energy/power/cost over websocket,
 * polls the REST API as a fallback, and lets the user stop the session.
 */
export function ActiveSessionScreen({
  monitoringClient,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  sessionsApiClient = sessionsApi,
}: ActiveSessionScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = normalizeRouteParam(params.id);
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [liveUpdate, setLiveUpdate] = useState<SessionMonitorUpdateEvent | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasStopError, setHasStopError] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (sessionId === null || userId === null) {
      return;
    }

    let isCancelled = false;

    /**
     * Fetches the latest session snapshot from the REST API.
     */
    const refreshSession = async (): Promise<void> => {
      try {
        const latestSession = await sessionsApiClient.getSession(userId, sessionId);

        if (!isCancelled) {
          setSession(latestSession);
          setHasLoadError(false);
        }
      } catch {
        if (!isCancelled) {
          setHasLoadError(true);
        }
      }
    };

    void refreshSession();

    const pollTimer = setInterval((): void => {
      void refreshSession();
    }, pollIntervalMs);

    return (): void => {
      isCancelled = true;
      clearInterval(pollTimer);
    };
  }, [pollIntervalMs, sessionId, sessionsApiClient, userId]);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }

    const client = monitoringClient ?? createSessionMonitoringClient();
    const unsubscribe = client.subscribeToSession(
      sessionId,
      (payload: SessionMonitorUpdateEvent): void => {
        setLiveUpdate(payload);
      },
    );

    return (): void => {
      unsubscribe();
      client.disconnect();
    };
  }, [monitoringClient, sessionId]);

  useEffect(() => {
    const clockTimer = setInterval((): void => {
      setNowMs(Date.now());
    }, CLOCK_TICK_MS);

    return (): void => {
      clearInterval(clockTimer);
    };
  }, []);

  const isTerminal = session !== null && TERMINAL_STATUSES.includes(session.status);

  useEffect(() => {
    if (isTerminal && sessionId !== null) {
      router.replace(`/sessions/${sessionId}/summary`);
    }
  }, [isTerminal, router, sessionId]);

  const durationSeconds = useMemo(() => {
    if (session === null) {
      return 0;
    }

    const endInstantMs = session.endTime === null ? nowMs : Date.parse(session.endTime);

    return computeDurationSeconds(session.startTime, endInstantMs);
  }, [nowMs, session]);

  /**
   * Asks for confirmation, then stops the active charging session.
   */
  const handleStopPress = (): void => {
    Alert.alert(t('sessions.active.stopConfirm.title'), t('sessions.active.stopConfirm.message'), [
      {
        style: 'cancel',
        text: t('sessions.active.stopConfirm.cancel'),
      },
      {
        onPress: (): void => {
          void stopChargingSession();
        },
        style: 'destructive',
        text: t('sessions.active.stopConfirm.confirm'),
      },
    ]);
  };

  /**
   * Stops the session and navigates to the summary screen on success.
   */
  const stopChargingSession = async (): Promise<void> => {
    if (sessionId === null || userId === null || isStopping) {
      return;
    }

    setIsStopping(true);
    setHasStopError(false);

    try {
      await sessionsApiClient.stopSession(userId, sessionId);
      router.replace(`/sessions/${sessionId}/summary`);
    } catch {
      setHasStopError(true);
    } finally {
      setIsStopping(false);
    }
  };

  if (sessionId === null || userId === null) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text
          className="mx-4 text-center text-sm font-semibold text-danger"
          testID="active-load-error"
        >
          {t('sessions.active.loadError')}
        </Text>
      </View>
    );
  }

  if (session === null) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 bg-background px-6"
        testID="active-loading"
      >
        {hasLoadError ? (
          <Text
            className="mx-4 text-center text-sm font-semibold text-danger"
            testID="active-load-error"
          >
            {t('sessions.active.loadError')}
          </Text>
        ) : (
          <>
            <ActivityIndicator color={PRIMARY} size="large" />
            <Text className="text-sm text-neutral-500">{t('sessions.active.loading')}</Text>
          </>
        )}
      </View>
    );
  }

  const energyKwh = liveUpdate?.energyDeliveredKwh ?? session.energyDelivered;
  const powerKw = liveUpdate?.powerKw ?? session.peakPower;
  const totalCostCents = liveUpdate?.totalCost ?? session.totalCost;

  return (
    <ScreenContainer>
      <View className="items-start border-b border-border bg-neutral-0 px-[18px] pb-3.5 pt-[22px]">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('sessions.active.title')}
        </Text>
        <StatusBadge
          className="mt-2"
          label={t(`sessions.status.${session.status}`)}
          testID="active-status"
          variant="primary"
        />
      </View>

      <View className="flex-row flex-wrap gap-3 p-4">
        <Card className="grow basis-[47%]">
          <Text className="text-xs font-bold uppercase text-neutral-500">
            {t('sessions.active.energyLabel')}
          </Text>
          <Text className="mt-1.5 text-[22px] font-bold text-text" testID="active-energy">
            {t('sessions.units.energy', { value: formatEnergyKwh(energyKwh) })}
          </Text>
        </Card>
        <Card className="grow basis-[47%]">
          <Text className="text-xs font-bold uppercase text-neutral-500">
            {t('sessions.active.powerLabel')}
          </Text>
          <Text className="mt-1.5 text-[22px] font-bold text-text" testID="active-power">
            {t('sessions.units.power', { value: formatPowerKw(powerKw) })}
          </Text>
        </Card>
        <Card className="grow basis-[47%]">
          <Text className="text-xs font-bold uppercase text-neutral-500">
            {t('sessions.active.durationLabel')}
          </Text>
          <Text className="mt-1.5 text-[22px] font-bold text-text" testID="active-duration">
            {formatDurationSeconds(durationSeconds)}
          </Text>
        </Card>
        <Card className="grow basis-[47%]">
          <Text className="text-xs font-bold uppercase text-neutral-500">
            {t('sessions.active.costLabel')}
          </Text>
          <Text className="mt-1.5 text-[22px] font-bold text-text" testID="active-cost">
            {t('sessions.units.amd', { amount: formatAmdFromCents(totalCostCents) })}
          </Text>
        </Card>
      </View>

      {hasStopError ? (
        <Text
          className="mx-4 text-center text-sm font-semibold text-danger"
          testID="active-stop-error"
        >
          {t('sessions.active.errors.stopFailed')}
        </Text>
      ) : null}

      <View className="mt-auto p-4">
        <Button
          accessibilityLabel={
            isStopping ? t('sessions.active.stopping') : t('sessions.active.stop')
          }
          className="gap-2"
          disabled={isStopping}
          onPress={handleStopPress}
          testID="active-stop"
          variant="danger"
        >
          {isStopping ? <ActivityIndicator color={NEUTRAL_0} /> : null}
          <Text className="text-[15px] font-bold text-white">
            {isStopping ? t('sessions.active.stopping') : t('sessions.active.stop')}
          </Text>
        </Button>
      </View>
    </ScreenContainer>
  );
}
