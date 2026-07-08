import type { SessionResponse } from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import {
  computeDurationSeconds,
  formatAmdFromCents,
  formatDurationSeconds,
  formatEnergyKwh,
} from './session-format';
import { shareSessionReceipt, sessionsApi, type SessionsApi } from './sessions-api';

type ReceiptState = 'downloading' | 'error' | 'idle';

interface SessionSummaryScreenProps {
  readonly sessionsApiClient?: Pick<SessionsApi, 'getSession'>;
  readonly shareReceipt?: (userId: string, sessionId: string) => Promise<void>;
}

const SECONDARY_BUTTON_CLASS =
  'items-center rounded-lg border border-primary bg-neutral-0 py-3.5';
const SECONDARY_BUTTON_TEXT_CLASS = 'text-[15px] font-bold text-primary';

/**
 * Final summary of one charging session with cost breakdown, status badge,
 * and a link to the PDF receipt.
 */
export function SessionSummaryScreen({
  sessionsApiClient = sessionsApi,
  shareReceipt = shareSessionReceipt,
}: SessionSummaryScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = normalizeRouteParam(params.id);
  const { state } = useOnboardingSession();
  const userId = state.userId;
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [receiptState, setReceiptState] = useState<ReceiptState>('idle');

  const handleReceiptPress = useCallback(async (): Promise<void> => {
    if (userId === null || session === null) {
      return;
    }

    setReceiptState('downloading');

    try {
      await shareReceipt(userId, session.id);
      setReceiptState('idle');
    } catch {
      setReceiptState('error');
    }
  }, [session, shareReceipt, userId]);

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
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-sm font-semibold text-danger" testID="summary-load-error">
          {t('sessions.summary.loadError')}
        </Text>
        {sessionId !== null && userId !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              void loadSession();
            }}
            className={SECONDARY_BUTTON_CLASS}
            testID="summary-retry"
          >
            <Text className={SECONDARY_BUTTON_TEXT_CLASS}>{t('sessions.actions.retry')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (session === null) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6" testID="summary-loading">
        <ActivityIndicator color="#0F766E" size="large" />
        <Text className="text-sm text-neutral-500">{t('sessions.summary.loading')}</Text>
      </View>
    );
  }

  const durationSeconds =
    session.endTime === null
      ? computeDurationSeconds(session.startTime, Date.now())
      : computeDurationSeconds(session.startTime, Date.parse(session.endTime));
  const statusBadgeClass = resolveStatusBadgeClass(session.status);
  const isCompleted = session.status === SessionStatus.COMPLETED;

  return (
    <View className="flex-1 bg-background">
      <View className="items-start border-b border-border bg-neutral-0 px-5 pb-3.5 pt-6">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('sessions.summary.title')}
        </Text>
        <Text
          className={`mt-2 overflow-hidden rounded-full px-3 py-1 text-[13px] font-bold ${statusBadgeClass}`}
          testID="summary-status"
        >
          {t(`sessions.status.${session.status}`)}
        </Text>
      </View>

      <View className="m-4 rounded-lg border border-border bg-neutral-0 p-4">
        <View className="flex-row items-center justify-between py-2.5">
          <Text className="text-sm text-neutral-500">{t('sessions.summary.energyLabel')}</Text>
          <Text className="text-base font-bold text-text" testID="summary-energy">
            {t('sessions.units.energy', { value: formatEnergyKwh(session.energyDelivered) })}
          </Text>
        </View>
        <View className="flex-row items-center justify-between py-2.5">
          <Text className="text-sm text-neutral-500">{t('sessions.summary.durationLabel')}</Text>
          <Text className="text-base font-bold text-text" testID="summary-duration">
            {formatDurationSeconds(durationSeconds)}
          </Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between border-t border-border pt-3.5">
          <Text className="text-base font-bold text-text">{t('sessions.summary.totalLabel')}</Text>
          <Text className="text-xl font-bold text-primary" testID="summary-total">
            {t('sessions.units.amd', { amount: formatAmdFromCents(session.totalCost) })}
          </Text>
        </View>
      </View>

      <View className="mt-auto gap-3 p-4">
        {isCompleted ? (
          <Pressable
            accessibilityRole="button"
            disabled={receiptState === 'downloading'}
            onPress={(): void => {
              void handleReceiptPress();
            }}
            className={`${SECONDARY_BUTTON_CLASS} ${receiptState === 'downloading' ? 'opacity-75' : ''}`}
            testID="summary-receipt"
          >
            <Text className={SECONDARY_BUTTON_TEXT_CLASS}>
              {receiptState === 'downloading'
                ? t('sessions.summary.receiptDownloading')
                : t('sessions.summary.receipt')}
            </Text>
          </Pressable>
        ) : null}
        {receiptState === 'error' ? (
          <Text className="text-center text-sm font-semibold text-danger" testID="summary-receipt-error">
            {t('sessions.summary.receiptError')}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            router.replace('/(tabs)/stations');
          }}
          className="items-center rounded-lg bg-primary py-4"
          testID="summary-done"
        >
          <Text className="text-[17px] font-bold text-white">{t('sessions.summary.done')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Resolves the status-badge utility classes for one session status so a FAILED/CANCELLED
 * charge never reads visually as a successful one.
 */
function resolveStatusBadgeClass(status: SessionStatus): string {
  if (status === SessionStatus.FAILED || status === SessionStatus.CANCELLED) {
    return 'bg-danger-bg text-danger';
  }

  if (status === SessionStatus.COMPLETED) {
    return 'bg-primary-100 text-primary';
  }

  return 'bg-neutral-200 text-neutral-700';
}
