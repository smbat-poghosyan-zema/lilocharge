import type {
  MostConfidentStatusResponse,
  StationConnectorResponse,
  StationDetailResponse,
  StationPricingPlanResponse,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '../../api';
import { useAppTranslation } from '../../i18n/use-app-translation';
import {
  formatCommunityStatusHint,
  useConnectorCommunityStatuses,
} from './connector-community-status';
import { stationsApi, type CommunityStationsApi } from './stations-api';

type StationDetailState =
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly detail: StationDetailResponse }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' };

interface StationDetailScreenProps {
  readonly stationsApiClient?: Pick<
    CommunityStationsApi,
    'getConnectorCommunityStatus' | 'getStationDetail'
  >;
}

interface StationConnectorRowProps {
  readonly communityStatus: MostConfidentStatusResponse | null;
  readonly connector: StationConnectorResponse;
  readonly pricingPlan: StationPricingPlanResponse | null;
  readonly onChargeHere: (connectorId: string) => void;
}

const EMPTY_CONNECTOR_IDS: readonly string[] = [];

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

  if (detailState.status === 'loading') {
    return (
      <View style={styles.centeredContainer} testID="station-detail-loading">
        <ActivityIndicator color="#0F766E" size="large" />
        <Text style={styles.mutedText}>{t('stations.detail.loading')}</Text>
      </View>
    );
  }

  if (detailState.status === 'notFound') {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="station-detail-not-found">
          {t('stations.detail.notFound')}
        </Text>
      </View>
    );
  }

  if (detailState.status === 'error') {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText} testID="station-detail-error">
          {t('stations.detail.loadError')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={(): void => {
            setReloadToken((previousToken) => previousToken + 1);
          }}
          style={({ pressed }) => {
            return [styles.secondaryButton, pressed ? styles.buttonPressed : null];
          }}
          testID="station-detail-retry"
        >
          <Text style={styles.secondaryButtonText}>{t('stations.detail.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const { detail } = detailState;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
      testID="station-detail-screen"
    >
      <View style={styles.headerCard}>
        <Text accessibilityRole="header" style={styles.title}>
          {detail.name}
        </Text>
        <Text style={styles.statusText}>{resolveStationStatusLabel(detail.status, t)}</Text>
        <Text style={styles.detailLine}>
          {t('stations.detail.operatorLabel')}: {detail.operatorName}
        </Text>
        <Text style={styles.detailLine} testID="station-detail-address">
          {t('stations.detail.addressLabel')}: {detail.address}, {detail.city}
        </Text>
        <Text style={styles.detailLine}>
          {t('stations.detail.openingHoursLabel')}:{' '}
          {detail.openingHours ?? t('stations.detail.openingHoursUnavailable')}
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('stations.detail.amenitiesTitle')}</Text>
        {detail.amenities.length === 0 ? (
          <Text style={styles.mutedText}>{t('stations.detail.amenitiesEmpty')}</Text>
        ) : (
          <Text style={styles.detailLine} testID="station-detail-amenities">
            {detail.amenities.join(' · ')}
          </Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('stations.detail.connectorsTitle')}</Text>
        {detail.connectors.length === 0 ? (
          <Text style={styles.mutedText}>{t('stations.detail.noConnectors')}</Text>
        ) : null}
        {detail.connectors.map((connector) => (
          <StationConnectorRow
            communityStatus={communityStatuses[connector.id] ?? null}
            connector={connector}
            key={connector.id}
            onChargeHere={handleChargeHere}
            pricingPlan={findPricingPlanByConnectorId(connector.id, detail.pricingPlans)}
          />
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('stations.detail.pricingTitle')}</Text>
        {detail.pricingPlans.length === 0 ? (
          <Text style={styles.mutedText}>{t('stations.detail.noPricing')}</Text>
        ) : null}
        {detail.pricingPlans.map((pricingPlan) => (
          <View
            key={pricingPlan.id}
            style={styles.rowCard}
            testID={`station-detail-pricing-plan-${pricingPlan.id}`}
          >
            <Text style={styles.rowTitle}>{pricingPlan.name}</Text>
            <Text style={styles.detailLine}>{formatPricingDetails(pricingPlan, t)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{t('stations.detail.reviewsTitle')}</Text>
        <Text style={styles.mutedText} testID="station-detail-review-summary">
          {resolveReviewSummary(detail.averageRating, detail.reviewCount, t)}
        </Text>
        {detail.reviews.map((review) => (
          <View
            key={review.id}
            style={styles.rowCard}
            testID={`station-detail-review-${review.id}`}
          >
            <Text style={styles.rowTitle}>
              {'★'} {review.rating.toFixed(1)}
            </Text>
            <Text style={styles.detailLine}>
              {review.comment ?? t('stations.detail.reviewWithoutComment')}
            </Text>
          </View>
        ))}
      </View>
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
  pricingPlan,
  onChargeHere,
}: StationConnectorRowProps): JSX.Element {
  const { t } = useAppTranslation();

  return (
    <View style={styles.rowCard} testID={`station-detail-connector-${connector.id}`}>
      <View style={styles.connectorHeader}>
        <Text style={styles.rowTitle}>
          {resolveConnectorTypeLabel(connector.connectorType, t)} · {connector.powerKw} kW
        </Text>
        <View style={styles.connectorStatusBadge}>
          <View
            style={[
              styles.connectorStatusDot,
              { backgroundColor: resolveStationStatusColor(connector.status) },
            ]}
          />
          <Text style={styles.connectorStatusText}>
            {resolveStationStatusLabel(connector.status, t)}
          </Text>
        </View>
      </View>
      <Text style={styles.detailLine}>{formatPricingDetails(pricingPlan, t)}</Text>
      {communityStatus !== null ? (
        <Text
          style={styles.communityStatusText}
          testID={`station-detail-community-status-${connector.id}`}
        >
          {formatCommunityStatusHint(
            communityStatus,
            resolveStationStatusLabel(communityStatus.status, t),
            t,
          )}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={(): void => {
          onChargeHere(connector.id);
        }}
        style={({ pressed }) => {
          return [styles.chargeButton, pressed ? styles.buttonPressed : null];
        }}
        testID={`station-detail-charge-${connector.id}`}
      >
        <Text style={styles.chargeButtonText}>{t('stations.detail.chargeHere')}</Text>
      </Pressable>
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
 * Maps connector status values to indicator colors.
 */
function resolveStationStatusColor(status: StationStatus): string {
  switch (status) {
    case StationStatus.OCCUPIED:
      return '#D97706';
    case StationStatus.OFFLINE:
      return '#9CA3AF';
    case StationStatus.MAINTENANCE:
      return '#B91C1C';
    case StationStatus.AVAILABLE:
    default:
      return '#059669';
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
 * Formats numeric values into Armenian dram strings.
 */
function formatDramAmount(value: number): string {
  return Number.isInteger(value) ? `${value} ֏` : `${value.toFixed(2)} ֏`;
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
  chargeButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 10,
    marginTop: 10,
    paddingVertical: 11,
  },
  chargeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  communityStatusText: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  connectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  connectorStatusBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  connectorStatusDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  connectorStatusText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  detailLine: {
    color: '#374151',
    fontSize: 13,
    marginTop: 6,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  mutedText: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 6,
  },
  rowCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    gap: 12,
    padding: 16,
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
  statusText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  title: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '700',
  },
});
