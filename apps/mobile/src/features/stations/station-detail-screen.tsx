import type {
  MostConfidentStatusResponse,
  StationConnectorResponse,
  StationDetailResponse,
  StationPricingPlanResponse,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { LoadingView } from '../../components/ui/state-views';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { normalizeRouteParam } from '../../utils/route-params';
import { useOnboardingSession } from '../onboarding/onboarding-session';
import { formatDramAmount } from '../sessions/session-format';
import {
  formatCommunityStatusHint,
  useConnectorCommunityStatuses,
} from './connector-community-status';
import { stationsApi, type CommunityStationsApi } from './stations-api';

const REPORTABLE_STATUSES: readonly StationStatus[] = [
  StationStatus.AVAILABLE,
  StationStatus.OCCUPIED,
  StationStatus.OFFLINE,
  StationStatus.MAINTENANCE,
];

type StationDetailState =
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly detail: StationDetailResponse }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' };

interface StationDetailScreenProps {
  readonly stationsApiClient?: Pick<
    CommunityStationsApi,
    'getConnectorCommunityStatus' | 'getStationDetail' | 'reportConnectorStatus'
  >;
}

type ConnectorReportFeedback = 'error' | 'signedOut' | 'success';

interface StationConnectorRowProps {
  readonly communityStatus: MostConfidentStatusResponse | null;
  readonly connector: StationConnectorResponse;
  readonly isSignedIn: boolean;
  readonly pricingPlan: StationPricingPlanResponse | null;
  readonly onChargeHere: (connectorId: string) => void;
  readonly onReportStatus: (connectorId: string, status: StationStatus) => Promise<void>;
}

const EMPTY_CONNECTOR_IDS: readonly string[] = [];

const CENTERED_CLASS = 'flex-1 items-center justify-center gap-2.5 bg-background px-6';
const ERROR_TEXT_CLASS = 'text-center text-sm font-semibold text-danger';
const DETAIL_LINE_CLASS = 'mt-1.5 text-[13px] text-neutral-700';
const MUTED_TEXT_CLASS = 'mt-1.5 text-[13px] text-text-muted';
const SECTION_TITLE_CLASS = 'text-[15px] font-bold text-neutral-900';
const ROW_CARD_CLASS = 'mt-2.5 rounded-md border border-border bg-neutral-50 px-3 py-2.5';
const ROW_TITLE_CLASS = 'text-sm font-bold text-neutral-900';
const COMMUNITY_ACTION_BUTTON_CLASS =
  'min-h-11 grow items-center justify-center rounded-full border border-primary bg-neutral-0 px-3.5 py-[9px] active:opacity-75';

/**
 * Full-page station detail screen: station facts, connectors with per-connector
 * pricing and community status, pricing plans, and user reviews.
 */
export function StationDetailScreen({
  stationsApiClient = stationsApi,
}: StationDetailScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const stationId = normalizeRouteParam(params.id);
  const { state: sessionState } = useOnboardingSession();
  const userId = sessionState.userId;
  const [detailState, setDetailState] = useState<StationDetailState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (stationId === null) {
      setDetailState({ status: 'notFound' });

      return;
    }

    let isCancelled = false;

    setDetailState({ status: 'loading' });
    stationsApiClient
      .getStationDetail(stationId)
      .then((detail: StationDetailResponse): void => {
        if (!isCancelled) {
          setDetailState({ detail, status: 'loaded' });
        }
      })
      .catch((error: unknown): void => {
        if (!isCancelled) {
          setDetailState({
            status: error instanceof ApiClientError && error.statusCode === 404
              ? 'notFound'
              : 'error',
          });
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [reloadToken, stationId, stationsApiClient]);

  const connectorIds = useMemo((): readonly string[] => {
    if (detailState.status !== 'loaded') {
      return EMPTY_CONNECTOR_IDS;
    }

    return detailState.detail.connectors.map((connector) => connector.id);
  }, [detailState]);
  const communityStatuses = useConnectorCommunityStatuses(connectorIds, stationsApiClient);

  const handleChargeHere = useCallback(
    (connectorId: string): void => {
      router.push(`/charge/confirm?connectorId=${connectorId}&stationId=${stationId ?? ''}`);
    },
    [router, stationId],
  );

  const handleReportConnectorStatus = useCallback(
    async (connectorId: string, status: StationStatus): Promise<void> => {
      if (userId === null) {
        throw new Error('Sign-in is required to report connector status');
      }

      await stationsApiClient.reportConnectorStatus(userId, { connectorId, status });
    },
    [stationsApiClient, userId],
  );

  if (detailState.status === 'loading') {
    return <LoadingView message={t('stations.detail.loading')} testID="station-detail-loading" />;
  }

  if (detailState.status === 'notFound') {
    return (
      <View className={CENTERED_CLASS}>
        <Text className={ERROR_TEXT_CLASS} testID="station-detail-not-found">
          {t('stations.detail.notFound')}
        </Text>
      </View>
    );
  }

  if (detailState.status === 'error') {
    return (
      <View className={CENTERED_CLASS}>
        <Text className={ERROR_TEXT_CLASS} testID="station-detail-error">
          {t('stations.detail.loadError')}
        </Text>
        <Button
          className="mt-3"
          onPress={(): void => {
            setReloadToken((previousToken) => previousToken + 1);
          }}
          testID="station-detail-retry"
          title={t('stations.detail.retry')}
          variant="secondary"
        />
      </View>
    );
  }

  const { detail } = detailState;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4"
      testID="station-detail-screen"
    >
      <Card>
        <Text accessibilityRole="header" className="text-[22px] font-bold text-neutral-900">
          {detail.name}
        </Text>
        <Text className="mt-1 text-[13px] font-semibold text-neutral-700">
          {resolveStationStatusLabel(detail.status, t)}
        </Text>
        <Text className={DETAIL_LINE_CLASS}>
          {t('stations.detail.operatorLabel')}: {detail.operatorName}
        </Text>
        <Text className={DETAIL_LINE_CLASS} testID="station-detail-address">
          {t('stations.detail.addressLabel')}: {detail.address}, {detail.city}
        </Text>
        <Text className={DETAIL_LINE_CLASS}>
          {t('stations.detail.openingHoursLabel')}:{' '}
          {detail.openingHours ?? t('stations.detail.openingHoursUnavailable')}
        </Text>
        <View className="mt-3 flex-row gap-2">
          <Pressable
            accessibilityLabel={t('stations.detail.writeReview')}
            accessibilityRole="button"
            onPress={(): void => {
              router.push(`/stations/${detail.id}/review`);
            }}
            className={COMMUNITY_ACTION_BUTTON_CLASS}
            testID="station-detail-write-review"
          >
            <Text className="text-[13px] font-bold text-primary dark:text-primary-900">
              {t('stations.detail.writeReview')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('stations.detail.reportProblem')}
            accessibilityRole="button"
            onPress={(): void => {
              router.push(`/stations/${detail.id}/report`);
            }}
            className={COMMUNITY_ACTION_BUTTON_CLASS}
            testID="station-detail-report-problem"
          >
            <Text className="text-[13px] font-bold text-primary dark:text-primary-900">
              {t('stations.detail.reportProblem')}
            </Text>
          </Pressable>
        </View>
      </Card>

      <Card>
        <Text className={SECTION_TITLE_CLASS}>{t('stations.detail.amenitiesTitle')}</Text>
        {detail.amenities.length === 0 ? (
          <Text className={MUTED_TEXT_CLASS}>{t('stations.detail.amenitiesEmpty')}</Text>
        ) : (
          <Text className={DETAIL_LINE_CLASS} testID="station-detail-amenities">
            {detail.amenities.join(' · ')}
          </Text>
        )}
      </Card>

      <Card>
        <Text className={SECTION_TITLE_CLASS}>{t('stations.detail.connectorsTitle')}</Text>
        {detail.connectors.length === 0 ? (
          <Text className={MUTED_TEXT_CLASS}>{t('stations.detail.noConnectors')}</Text>
        ) : null}
        {detail.connectors.map((connector) => (
          <StationConnectorRow
            communityStatus={communityStatuses[connector.id] ?? null}
            connector={connector}
            isSignedIn={userId !== null}
            key={connector.id}
            onChargeHere={handleChargeHere}
            onReportStatus={handleReportConnectorStatus}
            pricingPlan={findPricingPlanByConnectorId(connector.id, detail.pricingPlans)}
          />
        ))}
      </Card>

      <Card>
        <Text className={SECTION_TITLE_CLASS}>{t('stations.detail.pricingTitle')}</Text>
        {detail.pricingPlans.length === 0 ? (
          <Text className={MUTED_TEXT_CLASS}>{t('stations.detail.noPricing')}</Text>
        ) : null}
        {detail.pricingPlans.map((pricingPlan) => (
          <View
            key={pricingPlan.id}
            className={ROW_CARD_CLASS}
            testID={`station-detail-pricing-plan-${pricingPlan.id}`}
          >
            <Text className={ROW_TITLE_CLASS}>{pricingPlan.name}</Text>
            <Text className={DETAIL_LINE_CLASS}>{formatPricingDetails(pricingPlan, t)}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text className={SECTION_TITLE_CLASS}>{t('stations.detail.reviewsTitle')}</Text>
        <Text className={MUTED_TEXT_CLASS} testID="station-detail-review-summary">
          {resolveReviewSummary(detail.averageRating, detail.reviewCount, t)}
        </Text>
        {detail.reviews.map((review) => (
          <View
            key={review.id}
            className={ROW_CARD_CLASS}
            testID={`station-detail-review-${review.id}`}
          >
            <Text className={ROW_TITLE_CLASS}>
              {'★'} {review.rating.toFixed(1)}
            </Text>
            <Text className={DETAIL_LINE_CLASS}>
              {review.comment ?? t('stations.detail.reviewWithoutComment')}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

/**
 * Renders one connector row with status, pricing, community hint, and the
 * "Charge here" call to action.
 */
function StationConnectorRow({
  communityStatus,
  connector,
  isSignedIn,
  pricingPlan,
  onChargeHere,
  onReportStatus,
}: StationConnectorRowProps): JSX.Element {
  const { t } = useAppTranslation();
  const [isStatusPickerVisible, setIsStatusPickerVisible] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<ConnectorReportFeedback | null>(null);

  /**
   * Toggles the inline community status picker, gating on authentication.
   */
  const handleToggleStatusPicker = (): void => {
    if (!isSignedIn) {
      setReportFeedback('signedOut');

      return;
    }

    setReportFeedback(null);
    setIsStatusPickerVisible((previousVisibility) => !previousVisibility);
  };

  /**
   * Submits one community status report for this connector.
   */
  const handleSelectStatus = (status: StationStatus): void => {
    setIsStatusPickerVisible(false);
    onReportStatus(connector.id, status)
      .then((): void => {
        setReportFeedback('success');
      })
      .catch((): void => {
        setReportFeedback('error');
      });
  };

  return (
    <View className={ROW_CARD_CLASS} testID={`station-detail-connector-${connector.id}`}>
      <View className="flex-row items-center justify-between">
        <Text className={ROW_TITLE_CLASS}>
          {resolveConnectorTypeLabel(connector.connectorType, t)} · {connector.powerKw} kW
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View
            className={`h-2.5 w-2.5 rounded-full ${resolveStationStatusDotClass(connector.status)}`}
          />
          <Text className="text-xs font-semibold text-neutral-700">
            {resolveStationStatusLabel(connector.status, t)}
          </Text>
        </View>
      </View>
      <Text className={DETAIL_LINE_CLASS}>{formatPricingDetails(pricingPlan, t)}</Text>
      {communityStatus !== null ? (
        <Text
          className="mt-1.5 text-xs font-semibold text-accent"
          testID={`station-detail-community-status-${connector.id}`}
        >
          {formatCommunityStatusHint(
            communityStatus,
            resolveStationStatusLabel(communityStatus.status, t),
            t,
          )}
        </Text>
      ) : null}
      <Button
        className="mt-2.5"
        onPress={(): void => {
          onChargeHere(connector.id);
        }}
        testID={`station-detail-charge-${connector.id}`}
        title={t('stations.detail.chargeHere')}
      />
      <Pressable
        accessibilityLabel={t('stations.detail.communityReport.action')}
        accessibilityRole="button"
        onPress={handleToggleStatusPicker}
        className="mt-2 min-h-11 items-center justify-center rounded-sm border border-accent bg-neutral-0 py-[9px] active:opacity-75"
        testID={`station-detail-report-status-${connector.id}`}
      >
        <Text className="text-[13px] font-bold text-accent">
          {t('stations.detail.communityReport.action')}
        </Text>
      </Pressable>
      {isStatusPickerVisible ? (
        <View testID={`station-detail-report-status-picker-${connector.id}`}>
          <Text className={MUTED_TEXT_CLASS}>{t('stations.detail.communityReport.prompt')}</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {REPORTABLE_STATUSES.map((reportableStatus) => (
              <Pressable
                accessibilityLabel={resolveStationStatusLabel(reportableStatus, t)}
                accessibilityRole="button"
                key={reportableStatus}
                onPress={(): void => {
                  handleSelectStatus(reportableStatus);
                }}
                className="min-h-11 items-center justify-center rounded-full border border-accent bg-accent/10 px-3 py-[7px] active:opacity-75"
                testID={`station-detail-report-status-option-${connector.id}-${reportableStatus}`}
              >
                <Text className="text-xs font-bold text-accent">
                  {resolveStationStatusLabel(reportableStatus, t)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {reportFeedback !== null ? (
        <Text
          className={
            reportFeedback === 'success'
              ? 'mt-2 text-xs font-semibold text-primary-900'
              : ERROR_TEXT_CLASS
          }
          testID={`station-detail-report-status-feedback-${connector.id}`}
        >
          {resolveReportFeedbackLabel(reportFeedback, t)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Maps community status-report feedback states onto localized labels.
 */
function resolveReportFeedbackLabel(
  feedback: ConnectorReportFeedback,
  t: (key: string) => string,
): string {
  switch (feedback) {
    case 'success':
      return t('stations.detail.communityReport.success');
    case 'signedOut':
      return t('stations.detail.communityReport.signInRequired');
    case 'error':
    default:
      return t('stations.detail.communityReport.error');
  }
}

/**
 * Maps station and connector status values to localized labels.
 */
function resolveStationStatusLabel(status: StationStatus, t: (key: string) => string): string {
  switch (status) {
    case StationStatus.OCCUPIED:
      return t('stations.map.sheet.status.occupied');
    case StationStatus.OFFLINE:
      return t('stations.map.sheet.status.offline');
    case StationStatus.MAINTENANCE:
      return t('stations.map.sheet.status.maintenance');
    case StationStatus.AVAILABLE:
    default:
      return t('stations.map.sheet.status.available');
  }
}

/**
 * Maps connector status values to the indicator dot's background token class.
 */
function resolveStationStatusDotClass(status: StationStatus): string {
  switch (status) {
    case StationStatus.OCCUPIED:
      return 'bg-warning';
    case StationStatus.OFFLINE:
      return 'bg-neutral-400';
    case StationStatus.MAINTENANCE:
      return 'bg-danger';
    case StationStatus.AVAILABLE:
    default:
      return 'bg-success';
  }
}

/**
 * Returns a localized connector type label.
 */
function resolveConnectorTypeLabel(
  connectorType: ConnectorType,
  t: (key: string) => string,
): string {
  return t(`onboarding.vehicle.connectorTypes.${connectorType}`);
}

/**
 * Finds the first pricing plan linked to a connector.
 */
function findPricingPlanByConnectorId(
  connectorId: string,
  pricingPlans: readonly StationPricingPlanResponse[],
): StationPricingPlanResponse | null {
  return pricingPlans.find((pricingPlan) => pricingPlan.connectorId === connectorId) ?? null;
}

/**
 * Converts available pricing dimensions into a compact label string.
 */
function formatPricingDetails(
  pricingPlan: StationPricingPlanResponse | null,
  t: (key: string, options?: Readonly<Record<string, string>>) => string,
): string {
  if (pricingPlan === null) {
    return t('stations.detail.noPricing');
  }

  const pricingTokens: string[] = [];

  if (pricingPlan.pricePerKwh !== null) {
    pricingTokens.push(
      t('stations.map.sheet.pricingPerKwh', {
        amount: formatDramAmount(pricingPlan.pricePerKwh),
      }),
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

  if (pricingPlan.idleFee !== null) {
    pricingTokens.push(
      t('stations.map.sheet.pricingIdleFee', {
        amount: formatDramAmount(pricingPlan.idleFee),
      }),
    );
  }

  return pricingTokens.length > 0 ? pricingTokens.join(' · ') : t('stations.detail.noPricing');
}

/**
 * Formats average rating and review count as a one-line summary.
 */
function resolveReviewSummary(
  averageRating: number | null,
  reviewCount: number,
  t: (key: string, options?: Readonly<Record<string, number | string>>) => string,
): string {
  if (averageRating === null || reviewCount <= 0) {
    return t('stations.detail.noReviews');
  }

  return t('stations.detail.reviewSummary', {
    count: reviewCount,
    rating: averageRating.toFixed(1),
  });
}
