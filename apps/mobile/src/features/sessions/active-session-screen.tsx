import type { SessionMonitorUpdateEvent, SessionResponse } from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
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
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="active-load-error">
          {t('sessions.active.loadError')}
        </Text>
      </View>
    );
  }

  if (session === null) {
    return (
      <View style={styles.centeredContainer} testID="active-loading">
        {hasLoadError ? (
          <Text style={styles.errorText} testID="active-load-error">
            {t('sessions.active.loadError')}
          </Text>
        ) : (
          <>
            <ActivityIndicator color="#0F766E" size="large" />
            <Text style={styles.mutedText}>{t('sessions.active.loading')}</Text>
          </>
        )}
      </View>
    );
  }

  const energyKwh = liveUpdate?.energyDeliveredKwh ?? session.energyDelivered;
  const powerKw = liveUpdate?.powerKw ?? session.peakPower;
  const totalCostCents = liveUpdate?.totalCost ?? session.totalCost;

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('sessions.active.title')}
        </Text>
        <Text style={styles.statusBadge} testID="active-status">
          {t(`sessions.status.${session.status}`)}
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('sessions.active.energyLabel')}</Text>
          <Text style={styles.metricValue} testID="active-energy">
            {t('sessions.units.energy', { value: formatEnergyKwh(energyKwh) })}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('sessions.active.powerLabel')}</Text>
          <Text style={styles.metricValue} testID="active-power">
            {t('sessions.units.power', { value: formatPowerKw(powerKw) })}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('sessions.active.durationLabel')}</Text>
          <Text style={styles.metricValue} testID="active-duration">
            {formatDurationSeconds(durationSeconds)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('sessions.active.costLabel')}</Text>
          <Text style={styles.metricValue} testID="active-cost">
            {t('sessions.units.amd', { amount: formatAmdFromCents(totalCostCents) })}
          </Text>
        </View>
      </View>

      {hasStopError ? (
        <Text style={styles.errorText} testID="active-stop-error">
          {t('sessions.active.errors.stopFailed')}
        </Text>
      ) : null}

      <View style={styles.footerContainer}>
        <Pressable
          accessibilityRole="button"
          disabled={isStopping}
          onPress={handleStopPress}
          style={({ pressed }) => {
            return [styles.stopButton, pressed || isStopping ? styles.buttonPressed : null];
          }}
          testID="active-stop"
        >
          {isStopping ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={styles.stopButtonText}>
            {isStopping ? t('sessions.active.stopping') : t('sessions.active.stop')}
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

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.75,
  },
  centeredContainer: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    flex: 1,
    gap: 12,
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
    marginHorizontal: 16,
    textAlign: 'center',
  },
  footerContainer: {
    marginTop: 'auto',
    padding: 16,
  },
  headerContainer: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    padding: 16,
  },
  metricLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
  },
  mutedText: {
    color: '#4B5563',
    fontSize: 14,
  },
  statusBadge: {
    backgroundColor: '#CCFBF1',
    borderRadius: 999,
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  stopButton: {
    alignItems: 'center',
    backgroundColor: '#B91C1C',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
