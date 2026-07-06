import type {
  MostConfidentStatusResponse,
  StationConnectorResponse,
  StationDetailResponse,
  StationNearbyResponse,
  StationPricingPlanResponse,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { isJestRuntime } from '../../utils/is-jest-runtime';
import {
  formatCommunityStatusHint,
  useConnectorCommunityStatuses,
  type ConnectorCommunityStatusClient,
} from './connector-community-status';
import { stationsApi } from './stations-api';

const SHEET_SLIDE_DURATION_MS = 220;
const SHEET_SLIDE_TRANSLATE_Y = 280;
const REVIEW_PREVIEW_LIMIT = 2;

interface StationBottomSheetProps {
  readonly communityStatusClient?: ConnectorCommunityStatusClient;
  readonly hasActiveConnectorFilters: boolean;
  readonly hasDetailLoadError: boolean;
  readonly isFavorite: boolean;
  readonly isLoadingDetail: boolean;
  readonly station: StationNearbyResponse;
  readonly stationDetail: StationDetailResponse | null;
  readonly onClose: () => void;
  readonly onNavigateToDetail: (stationId: string) => void;
  readonly onToggleFavorite: (station: StationNearbyResponse) => void;
}

interface StationConnectorCardProps {
  readonly communityStatus: MostConfidentStatusResponse | null;
  readonly connector: StationConnectorResponse;
  readonly pricingPlan: StationPricingPlanResponse | null;
}

/**
 * Renders the map station bottom sheet with connectors, pricing preview, and review summary.
 */
export function StationBottomSheet({
  communityStatusClient = stationsApi,
  hasActiveConnectorFilters,
  hasDetailLoadError,
  isFavorite,
  isLoadingDetail,
  station,
  stationDetail,
  onClose,
  onNavigateToDetail,
  onToggleFavorite,
}: StationBottomSheetProps): JSX.Element {
  const { t } = useAppTranslation();
  const sheetTranslateProgress = useRef<Animated.Value>(new Animated.Value(1)).current;

  useEffect(() => {
    runSheetSlideInAnimation(sheetTranslateProgress);
  }, [sheetTranslateProgress]);

  const sheetTranslateY = sheetTranslateProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SHEET_SLIDE_TRANSLATE_Y],
  });

  const stationStatus = stationDetail?.status ?? station.status;
  const stationDistanceMeters = stationDetail?.distanceMeters ?? station.distanceMeters;
  const stationOpeningHours = stationDetail?.openingHours ?? station.openingHours;
  const connectors = stationDetail?.connectors ?? [];
  const pricingPlans = stationDetail?.pricingPlans ?? [];
  const reviews = stationDetail?.reviews ?? [];

  const reviewPreview = useMemo(() => {
    return reviews.slice(0, REVIEW_PREVIEW_LIMIT);
  }, [reviews]);

  const connectorIds = useMemo((): readonly string[] => {
    return connectors.map((connector) => connector.id);
  }, [connectors]);
  const communityStatuses = useConnectorCommunityStatuses(connectorIds, communityStatusClient);

  return (
    <Animated.View
      style={[styles.bottomSheet, { transform: [{ translateY: sheetTranslateY }] }]}
      testID="station-bottom-sheet"
    >
      <View style={styles.bottomSheetHandle} />
      <View style={styles.bottomSheetHeader}>
        <View style={styles.bottomSheetHeaderContent}>
          <Text style={styles.bottomSheetTitle}>{station.name}</Text>
          <Text style={styles.bottomSheetStatus}>
            {resolveStationStatusLabel(stationStatus, t)}
          </Text>
        </View>
        <View style={styles.bottomSheetHeaderActions}>
          <Pressable
            accessibilityRole="button"
            onPress={(): void => {
              onToggleFavorite(station);
            }}
            style={({ pressed }) => {
              return [styles.favoriteButton, pressed ? styles.favoriteButtonPressed : null];
            }}
            testID="station-bottom-sheet-favorite-button"
          >
            <Text style={styles.favoriteButtonText}>
              {isFavorite
                ? t('stations.map.sheet.removeFavorite')
                : t('stations.map.sheet.saveFavorite')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => {
              return [
                styles.bottomSheetCloseButton,
                pressed ? styles.bottomSheetCloseButtonPressed : null,
              ];
            }}
            testID="station-bottom-sheet-close-button"
          >
            <Text style={styles.bottomSheetCloseText}>{t('stations.map.sheet.close')}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.bottomSheetDetail}>
        {t('stations.map.sheet.operatorLabel')}: {station.operatorName}
      </Text>
      <Text style={styles.bottomSheetDetail}>
        {t('stations.map.sheet.addressLabel')}: {station.address}, {station.city}
      </Text>
      <Text style={styles.bottomSheetDetail}>
        {t('stations.map.sheet.distanceLabel')}:{' '}
        {formatDistanceMetersForDisplay(stationDistanceMeters, t)}
      </Text>
      <Text style={styles.bottomSheetDetail}>
        {t('stations.map.sheet.openingHoursLabel')}:{' '}
        {stationOpeningHours ?? t('stations.map.sheet.openingHoursUnavailable')}
      </Text>

      <ScrollView
        contentContainerStyle={styles.sheetScrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.sheetScrollView}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{t('stations.map.sheet.connectorsTitle')}</Text>
          {hasActiveConnectorFilters ? (
            <Text style={styles.filteredBadge} testID="station-bottom-sheet-filtered-badge">
              {t('stations.map.sheet.filteredLabel')}
            </Text>
          ) : null}
        </View>
        {isLoadingDetail ? (
          <Text style={styles.sectionMessage} testID="station-bottom-sheet-detail-loading">
            {t('stations.map.sheet.detailLoading')}
          </Text>
        ) : null}
        {hasDetailLoadError ? (
          <Text style={styles.sectionErrorMessage} testID="station-bottom-sheet-detail-error">
            {t('stations.map.sheet.detailError')}
          </Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError && connectors.length === 0 ? (
          <Text style={styles.sectionMessage}>{t('stations.map.sheet.noConnectors')}</Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError
          ? connectors.map((connector) => (
              <StationConnectorCard
                communityStatus={communityStatuses[connector.id] ?? null}
                connector={connector}
                key={connector.id}
                pricingPlan={findPricingPlanByConnectorId(connector.id, pricingPlans)}
              />
            ))
          : null}

        <Text style={styles.sectionTitle}>{t('stations.map.sheet.reviewsTitle')}</Text>
        {!isLoadingDetail && !hasDetailLoadError ? (
          <Text style={styles.reviewSummary}>
            {resolveReviewSummary(
              stationDetail?.averageRating,
              stationDetail?.reviewCount ?? reviews.length,
              t,
            )}
          </Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError && reviews.length === 0 ? (
          <Text style={styles.sectionMessage}>{t('stations.map.sheet.noReviews')}</Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError
          ? reviewPreview.map((review) => (
              <View
                key={review.id}
                style={styles.reviewCard}
                testID={`station-review-card-${review.id}`}
              >
                <Text style={styles.reviewRating}>
                  {'\u2605'} {review.rating.toFixed(1)}
                </Text>
                <Text style={styles.reviewComment}>
                  {review.comment ?? t('stations.map.sheet.reviewWithoutComment')}
                </Text>
              </View>
            ))
          : null}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={(): void => {
          onNavigateToDetail(station.id);
        }}
        style={({ pressed }) => {
          return [styles.detailButton, pressed ? styles.detailButtonPressed : null];
        }}
        testID="station-bottom-sheet-detail-button"
      >
        <Text style={styles.detailButtonText}>{t('stations.map.sheet.viewDetails')}</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Renders one connector summary card with status, pricing, and an optional
 * community-reported confidence hint.
 */
function StationConnectorCard({
  communityStatus,
  connector,
  pricingPlan,
}: StationConnectorCardProps): JSX.Element {
  const { t } = useAppTranslation();

  return (
    <View style={styles.connectorCard} testID={`station-connector-card-${connector.id}`}>
      <View style={styles.connectorHeader}>
        <Text style={styles.connectorType}>
          {resolveConnectorTypeLabel(connector.connectorType, t)} · {connector.powerKw} kW
        </Text>
        <Text style={styles.connectorStatus}>{resolveStationStatusLabel(connector.status, t)}</Text>
      </View>
      <Text style={styles.pricingPlanName}>
        {pricingPlan?.name ?? t('stations.map.sheet.noPricing')}
      </Text>
      <Text style={styles.pricingText}>{formatPricingDetails(pricingPlan, t)}</Text>
      {communityStatus !== null ? (
        <Text
          style={styles.communityStatusText}
          testID={`station-connector-community-status-${connector.id}`}
        >
          {formatCommunityStatusHint(
            communityStatus,
            resolveStationStatusLabel(communityStatus.status, t),
            t,
          )}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Animates the bottom sheet from off-screen into view.
 */
function runSheetSlideInAnimation(sheetTranslateProgress: Animated.Value): void {
  if (isJestRuntime()) {
    sheetTranslateProgress.setValue(0);
    return;
  }

  sheetTranslateProgress.setValue(1);

  Animated.timing(sheetTranslateProgress, {
    duration: SHEET_SLIDE_DURATION_MS,
    toValue: 0,
    useNativeDriver: false,
  }).start();
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
 * Formats station distance for compact display in the bottom sheet.
 */
function formatDistanceMetersForDisplay(
  distanceMeters: number | null,
  t: (key: string) => string,
): string {
  if (distanceMeters === null) {
    return t('stations.map.sheet.distanceUnavailable');
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
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
    return t('stations.map.sheet.noPricing');
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

  return pricingTokens.length > 0 ? pricingTokens.join(' · ') : t('stations.map.sheet.noPricing');
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
  averageRating: number | null | undefined,
  reviewCount: number,
  t: (key: string, options?: Readonly<Record<string, string | number>>) => string,
): string {
  if (averageRating === null || averageRating === undefined || reviewCount <= 0) {
    return t('stations.map.sheet.noReviews');
  }

  return t('stations.map.sheet.reviewSummary', {
    count: reviewCount,
    rating: averageRating.toFixed(1),
  });
}

const styles = StyleSheet.create({
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    bottom: 0,
    left: 0,
    maxHeight: '62%',
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: {
      height: -2,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  bottomSheetCloseButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bottomSheetCloseButtonPressed: {
    opacity: 0.75,
  },
  bottomSheetCloseText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomSheetDetail: {
    color: '#374151',
    fontSize: 13,
    marginTop: 8,
  },
  bottomSheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#D1D5DB',
    borderRadius: 999,
    height: 4,
    marginBottom: 12,
    width: 56,
  },
  bottomSheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomSheetHeaderActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  bottomSheetHeaderContent: {
    flex: 1,
    marginRight: 10,
  },
  bottomSheetStatus: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  bottomSheetTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
  },
  communityStatusText: {
    color: '#6D28D9',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  connectorCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  connectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  connectorStatus: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '600',
  },
  connectorType: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  filteredBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: 999,
    color: '#065F46',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  detailButton: {
    alignItems: 'center',
    backgroundColor: '#14532D',
    borderRadius: 10,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailButtonPressed: {
    opacity: 0.8,
  },
  detailButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  favoriteButton: {
    backgroundColor: '#ECFDF5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  favoriteButtonPressed: {
    opacity: 0.75,
  },
  favoriteButtonText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
  },
  pricingPlanName: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  pricingText: {
    color: '#1F2937',
    fontSize: 12,
    marginTop: 4,
  },
  reviewCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewComment: {
    color: '#374151',
    fontSize: 12,
    marginTop: 6,
  },
  reviewRating: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  reviewSummary: {
    color: '#4B5563',
    fontSize: 12,
    marginTop: 2,
  },
  sectionErrorMessage: {
    color: '#B91C1C',
    fontSize: 12,
    marginTop: 8,
  },
  sectionMessage: {
    color: '#4B5563',
    fontSize: 12,
    marginTop: 8,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sheetScrollContent: {
    paddingBottom: 6,
  },
  sheetScrollView: {
    marginTop: 4,
  },
});
