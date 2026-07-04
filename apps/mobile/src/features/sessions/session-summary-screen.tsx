import type { SessionResponse } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import {
  computeDurationSeconds,
  formatAmdFromCents,
  formatDurationSeconds,
  formatEnergyKwh,
} from './session-format';
import { buildReceiptUrl, sessionsApi, type SessionsApi } from './sessions-api';

interface SessionSummaryScreenProps {
  readonly sessionsApiClient?: Pick<SessionsApi, 'getSession'>;
}

/**
 * Final summary of one charging session with cost breakdown, status badge,
 * and a link to the PDF receipt.
 */
export function SessionSummaryScreen({
  sessionsApiClient = sessionsApi,
}: SessionSummaryScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = normalizeRouteParam(params.id);
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);

  const loadSession = useCallback(async (): Promise<void> => {
    if (sessionId === null || userId === null) {
      return;
    }

    setHasLoadError(false);

    try {
      const loadedSession = await sessionsApiClient.getSession(userId, sessionId);

      setSession(loadedSession);
    } catch {
      setHasLoadError(true);
    }
  }, [sessionId, sessionsApiClient, userId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (sessionId === null || userId === null || hasLoadError) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="summary-load-error">
          {t('sessions.summary.loadError')}
        </Text>
        {sessionId !== null && userId !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              void loadSession();
            }}
            style={({ pressed }) => {
              return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
            }}
            testID="summary-retry"
          >
            <Text style={styles.secondaryButtonText}>{t('sessions.actions.retry')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (session === null) {
    return (
      <View style={styles.centeredContainer} testID="summary-loading">
        <ActivityIndicator color="#0F766E" size="large" />
        <Text style={styles.mutedText}>{t('sessions.summary.loading')}</Text>
      </View>
    );
  }

  const durationSeconds =
    session.endTime === null
      ? computeDurationSeconds(session.startTime, Date.now())
      : computeDurationSeconds(session.startTime, Date.parse(session.endTime));

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('sessions.summary.title')}
        </Text>
        <Text style={styles.statusBadge} testID="summary-status">
          {t(`sessions.status.${session.status}`)}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('sessions.summary.energyLabel')}</Text>
          <Text style={styles.rowValue} testID="summary-energy">
            {t('sessions.units.energy', { value: formatEnergyKwh(session.energyDelivered) })}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('sessions.summary.durationLabel')}</Text>
          <Text style={styles.rowValue} testID="summary-duration">
            {formatDurationSeconds(durationSeconds)}
          </Text>
        </View>
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>{t('sessions.summary.totalLabel')}</Text>
          <Text style={styles.totalValue} testID="summary-total">
            {t('sessions.units.amd', { amount: formatAmdFromCents(session.totalCost) })}
          </Text>
        </View>
      </View>

      <View style={styles.footerContainer}>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            void Linking.openURL(buildReceiptUrl(userId, session.id));
          }}
          style={({ pressed }) => {
            return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="summary-receipt"
        >
          <Text style={styles.secondaryButtonText}>{t('sessions.summary.receipt')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/(tabs)/stations');
          }}
          style={({ pressed }) => {
            return [styles.primaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="summary-done"
        >
          <Text style={styles.primaryButtonText}>{t('sessions.summary.done')}</Text>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    margin: 16,
    padding: 16,
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
    textAlign: 'center',
  },
  footerContainer: {
    gap: 12,
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
  mutedText: {
    color: '#4B5563',
    fontSize: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  rowLabel: {
    color: '#4B5563',
    fontSize: 14,
  },
  rowValue: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#0F766E',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontSize: 15,
    fontWeight: '700',
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
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
  totalLabel: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  totalRow: {
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 14,
  },
  totalValue: {
    color: '#0F766E',
    fontSize: 20,
    fontWeight: '700',
  },
});
