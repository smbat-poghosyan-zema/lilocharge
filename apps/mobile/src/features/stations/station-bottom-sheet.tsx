import type {
  MostConfidentStatusResponse,
  StationConnectorResponse,
  StationDetailResponse,
  StationNearbyResponse,
  StationPricingPlanResponse,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '../../components/ui/button';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { isJestRuntime } from '../../utils/is-jest-runtime';
import { formatDramAmount } from '../sessions/session-format';
import {
  formatCommunityStatusHint,
  useConnectorCommunityStatuses,
  type ConnectorCommunityStatusClient,
} from './connector-community-status';
import { stationsApi } from './stations-api';

const SHEET_SLIDE_DURATION_MS = 220;
const SHEET_SLIDE_TRANSLATE_Y = 280;
const REVIEW_PREVIEW_LIMIT = 2;

/**
 * Drop shadow for the sheet surface. Kept inline because RN shadow props
 * (`shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`) have no className
 * equivalent, and it merges with the animated `transform` on the same element.
 */
const SHEET_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { height: -2, width: 0 },
  shadowOpacity: 0.12,
  shadowRadius: 8,
} as const;

const SHEET_DETAIL_CLASS = 'mt-2 text-[13px] text-neutral-700';
const SECTION_TITLE_CLASS = 'mt-3 text-sm font-bold text-neutral-900';
const SECTION_MESSAGE_CLASS = 'mt-2 text-xs text-neutral-700';

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
      className="absolute bottom-0 left-0 right-0 max-h-[62%] rounded-t-xl bg-neutral-0 px-[18px] pb-4 pt-3"
      style={[SHEET_SHADOW, { transform: [{ translateY: sheetTranslateY }] }]}
      testID="station-bottom-sheet"
    >
      <View className="mb-3 h-1 w-14 self-center rounded-full bg-neutral-200" />
      <View className="flex-row items-start justify-between">
        <View className="mr-2.5 flex-1">
          <Text className="text-lg font-bold text-neutral-900">{station.name}</Text>
          <Text className="mt-1 text-xs font-semibold text-neutral-700">
            {resolveStationStatusLabel(stationStatus, t)}
          </Text>
        </View>
        <View className="items-end gap-2">
          <Pressable
            accessibilityLabel={
              isFavorite
                ? t('stations.map.sheet.removeFavorite')
                : t('stations.map.sheet.saveFavorite')
            }
            accessibilityRole="button"
            accessibilityState={{ selected: isFavorite }}
            onPress={(): void => {
              onToggleFavorite(station);
            }}
            className="min-h-11 items-center justify-center rounded-full bg-primary-50 px-3 py-[7px] active:opacity-75"
            testID="station-bottom-sheet-favorite-button"
          >
            <Text className="text-xs font-bold text-primary-900">
              {isFavorite
                ? t('stations.map.sheet.removeFavorite')
                : t('stations.map.sheet.saveFavorite')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('stations.map.sheet.close')}
            accessibilityRole="button"
            onPress={onClose}
            className="min-h-11 items-center justify-center rounded-full bg-neutral-200 px-3 py-[7px] active:opacity-75"
            testID="station-bottom-sheet-close-button"
          >
            <Text className="text-xs font-bold text-neutral-900">
              {t('stations.map.sheet.close')}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text className={SHEET_DETAIL_CLASS}>
        {t('stations.map.sheet.operatorLabel')}: {station.operatorName}
      </Text>
      <Text className={SHEET_DETAIL_CLASS}>
        {t('stations.map.sheet.addressLabel')}: {station.address}, {station.city}
      </Text>
      <Text className={SHEET_DETAIL_CLASS}>
        {t('stations.map.sheet.distanceLabel')}:{' '}
        {formatDistanceMetersForDisplay(stationDistanceMeters, t)}
      </Text>
      <Text className={SHEET_DETAIL_CLASS}>
        {t('stations.map.sheet.openingHoursLabel')}:{' '}
        {stationOpeningHours ?? t('stations.map.sheet.openingHoursUnavailable')}
      </Text>

      <ScrollView
        className="mt-1"
        contentContainerClassName="pb-1.5"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-2">
          <Text className={SECTION_TITLE_CLASS}>{t('stations.map.sheet.connectorsTitle')}</Text>
          {hasActiveConnectorFilters ? (
            <Text
              className="overflow-hidden rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-900"
              testID="station-bottom-sheet-filtered-badge"
            >
              {t('stations.map.sheet.filteredLabel')}
            </Text>
          ) : null}
        </View>
        {isLoadingDetail ? (
          <Text className={SECTION_MESSAGE_CLASS} testID="station-bottom-sheet-detail-loading">
            {t('stations.map.sheet.detailLoading')}
          </Text>
        ) : null}
        {hasDetailLoadError ? (
          <Text
            className="mt-2 text-xs text-danger"
            testID="station-bottom-sheet-detail-error"
          >
            {t('stations.map.sheet.detailError')}
          </Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError && connectors.length === 0 ? (
          <Text className={SECTION_MESSAGE_CLASS}>{t('stations.map.sheet.noConnectors')}</Text>
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

        <Text className={SECTION_TITLE_CLASS}>{t('stations.map.sheet.reviewsTitle')}</Text>
        {!isLoadingDetail && !hasDetailLoadError ? (
          <Text className="mt-0.5 text-xs text-neutral-700">
            {resolveReviewSummary(
              stationDetail?.averageRating,
              stationDetail?.reviewCount ?? reviews.length,
              t,
            )}
          </Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError && reviews.length === 0 ? (
          <Text className={SECTION_MESSAGE_CLASS}>{t('stations.map.sheet.noReviews')}</Text>
        ) : null}
        {!isLoadingDetail && !hasDetailLoadError
          ? reviewPreview.map((review) => (
              <View
                key={review.id}
                className="mt-2 rounded-md border border-border bg-neutral-50 px-3 py-2.5"
                testID={`station-review-card-${review.id}`}
              >
                <Text className="text-xs font-bold text-neutral-900">
                  {'\u2605'} {review.rating.toFixed(1)}
                </Text>
                <Text className="mt-1.5 text-xs text-neutral-700">
                  {review.comment ?? t('stations.map.sheet.reviewWithoutComment')}
                </Text>
              </View>
            ))
          : null}
      </ScrollView>

      <Button
        className="mt-3"
        onPress={(): void => {
          onNavigateToDetail(station.id);
        }}
        testID="station-bottom-sheet-detail-button"
        title={t('stations.map.sheet.viewDetails')}
      />
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
    <View
      className="mt-2 rounded-md border border-border bg-neutral-50 px-3 py-2.5"
      testID={`station-connector-card-${connector.id}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-bold text-neutral-900">
          {resolveConnectorTypeLabel(connector.connectorType, t)} · {connector.powerKw} kW
        </Text>
        <Text className="text-xs font-semibold text-neutral-700">
          {resolveStationStatusLabel(connector.status, t)}
        </Text>
      </View>
      <Text className="mt-1.5 text-xs font-semibold text-neutral-700">
        {pricingPlan?.name ?? t('stations.map.sheet.noPricing')}
      </Text>
      <Text className="mt-1 text-xs text-neutral-900">{formatPricingDetails(pricingPlan, t)}</Text>
      {communityStatus !== null ? (
        <Text
          className="mt-1 text-[11px] font-semibold text-accent"
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
