import type {
  FavoriteStation,
  NearbyStationsQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { derivePowerTier } from '@lilocharge/shared-types';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Mapbox from '@rnmapbox/maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { resolveMapboxAccessToken } from '../../config/runtime';
import { useAppTranslation } from '../../i18n/use-app-translation';
import {
  MAP_CLUSTER_HIGH,
  MAP_CLUSTER_LOW,
  MAP_CLUSTER_MID,
  NEUTRAL_0,
  NEUTRAL_900,
} from '../../theme/colors';
import { favoritesStorage, type FavoritesStorage } from '../favorites/favorites-storage';
import { createFavoritesSync, type FavoritesSync } from '../favorites/favorites-sync';
import { configureMapboxSdk } from './map/mapbox-sdk';
import {
  buildConnectorCountTextExpression,
  buildStationFeatureCollection,
  buildStationMarkerColorExpression,
  extractStationIdFromShapePressEvent,
} from './map/station-map.utils';
import { downloadOfflineTiles, type StationOfflineTileRegion } from './map/station-offline-tiles';
import {
  buildDefaultStationFilters,
  hasAnyActiveFilters,
  type StationFilterOperatorOption,
  type StationFilterState,
  StationFilters,
} from './station-filters';
import { StationSearchInput } from './station-search-input';
import { StationBottomSheet } from './station-bottom-sheet';
import { StationMarker } from './station-marker';
import { stationsApi, type StationsApi } from './stations-api';
import { isJestRuntime } from '../../utils/is-jest-runtime';
import { useDebouncedValue } from './use-debounced-value';

const DEFAULT_CAMERA_CENTER: GeoJSON.Position = [44.4991, 40.1792];
const DEFAULT_CAMERA_ZOOM_LEVEL = 12;
const FOCUSED_STATION_CAMERA_ZOOM_LEVEL = 14;
const DEFAULT_NEARBY_STATIONS_QUERY: NearbyStationsQueryRequest = {
  latitude: 40.1792,
  limit: 100,
  longitude: 44.4991,
  radiusMeters: 25000,
};
const DEFAULT_OFFLINE_TILE_REGION: StationOfflineTileRegion = {
  bounds: {
    northEast: [44.73, 40.33],
    southWest: [44.31, 40.02],
  },
  id: 'yerevan-station-core',
  maxZoomLevel: 15,
  minZoomLevel: 10,
};
const STATION_REFRESH_INTERVAL_MS = 30000;
const STATION_SEARCH_DEBOUNCE_MS = 350;
const DEFAULT_STATION_SEARCH_LIMIT = 20;
const FILTER_PANEL_ANIM_DURATION_MS = 250;

const CLUSTER_FILTER = ['has', 'point_count'] as const;
const UNCLUSTERED_FILTER = ['!', ['has', 'point_count']] as const;
const CLUSTER_COLOR_EXPRESSION = [
  'step',
  ['get', 'point_count'],
  MAP_CLUSTER_LOW,
  15,
  MAP_CLUSTER_MID,
  40,
  MAP_CLUSTER_HIGH,
] as const;
const CLUSTER_RADIUS_EXPRESSION = ['step', ['get', 'point_count'], 18, 15, 24, 40, 30] as const;
const CLUSTER_COUNT_EXPRESSION = ['get', 'point_count_abbreviated'] as const;

/** Mapbox `MapView` takes a JS style object (not a className); fill the map surface. */
const MAP_VIEW_STYLE = { flex: 1 } as const;

/** Shared translucent white status pill shown over the map overlay. */
const STATUS_PILL_CLASS =
  'mb-1.5 overflow-hidden rounded-full bg-neutral-0/90 px-2.5 py-1 text-[11px] text-neutral-900';

type OfflineDownloadStatus = 'ERROR' | 'IDLE' | 'IN_PROGRESS' | 'SUCCESS';

interface MapCameraState {
  readonly centerCoordinate: GeoJSON.Position;
  readonly zoomLevel: number;
}

/** Geographic coordinates used to anchor nearby/search station queries. */
interface StationQueryCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

interface StationsScreenProps {
  readonly favoritesStorageClient?: FavoritesStorage;
  readonly favoritesSyncClient?: FavoritesSync;
  readonly mapboxToken?: string;
  readonly stationsApiClient?: StationsApi;
}

/**
 * Renders the station discovery map with Mapbox clustering and offline tile support.
 */
export function StationsScreen({
  favoritesStorageClient = favoritesStorage,
  favoritesSyncClient,
  mapboxToken = resolveMapboxTokenFromGlobalEnv(),
  stationsApiClient = stationsApi,
}: StationsScreenProps = {}): JSX.Element {
  const router = useRouter();
  const { t } = useAppTranslation();
  const favoritesSync = useMemo<FavoritesSync>(() => {
    return favoritesSyncClient ?? createFavoritesSync({ favoritesStorageClient });
  }, [favoritesStorageClient, favoritesSyncClient]);
  const [hasFavoriteSyncError, setHasFavoriteSyncError] = useState<boolean>(false);
  const resolvedMapboxToken = resolveMapboxAccessToken(mapboxToken);
  const [stations, setStations] = useState<readonly StationNearbyResponse[]>([]);
  const [isRefreshingStations, setIsRefreshingStations] = useState<boolean>(true);
  const [hasStationLoadError, setHasStationLoadError] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedStationDetail, setSelectedStationDetail] = useState<StationDetailResponse | null>(
    null,
  );
  const [isLoadingSelectedStationDetail, setIsLoadingSelectedStationDetail] =
    useState<boolean>(false);
  const [hasSelectedStationDetailLoadError, setHasSelectedStationDetailLoadError] =
    useState<boolean>(false);
  const [stationFilters, setStationFilters] = useState<StationFilterState>(() => {
    return buildDefaultStationFilters();
  });
  const [offlineDownloadStatus, setOfflineDownloadStatus] = useState<OfflineDownloadStatus>('IDLE');
  const [cameraState, setCameraState] = useState<MapCameraState>(buildDefaultMapCameraState);
  const [searchInputValue, setSearchInputValue] = useState<string>('');
  const debouncedSearchQuery = useDebouncedValue(searchInputValue, STATION_SEARCH_DEBOUNCE_MS);
  const [isFilterPanelVisible, setIsFilterPanelVisible] = useState<boolean>(false);
  const filterPanelAnimProgress = useRef<Animated.Value>(new Animated.Value(0)).current;
  const [favoriteStationIds, setFavoriteStationIds] = useState<readonly string[]>(() => {
    return extractFavoriteStationIds(favoritesStorageClient.listFavoriteStations());
  });
  const [deviceCoordinates, setDeviceCoordinates] = useState<StationQueryCoordinates | null>(null);
  const queryCoordinates = useMemo<StationQueryCoordinates>(() => {
    return (
      deviceCoordinates ?? {
        latitude: DEFAULT_NEARBY_STATIONS_QUERY.latitude,
        longitude: DEFAULT_NEARBY_STATIONS_QUERY.longitude,
      }
    );
  }, [deviceCoordinates]);

  useEffect(() => {
    let isMounted = true;

    /**
     * Requests foreground location permission and resolves the current device position,
     * silently keeping the default Yerevan center when denied or unavailable.
     */
    async function resolveDeviceCoordinates(): Promise<void> {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!isMounted || !permission.granted) {
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isMounted) {
          return;
        }

        const coordinates: StationQueryCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setDeviceCoordinates(coordinates);
        setCameraState(buildDefaultMapCameraState(coordinates));
      } catch {
        // Location unavailable (denied, disabled, or unsupported) — keep Yerevan default.
      }
    }

    void resolveDeviceCoordinates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setFavoriteStationIds(extractFavoriteStationIds(favoritesStorageClient.listFavoriteStations()));

    return favoritesStorageClient.subscribe(() => {
      setFavoriteStationIds(
        extractFavoriteStationIds(favoritesStorageClient.listFavoriteStations()),
      );
    });
  }, [favoritesStorageClient]);

  const stationFilterOperatorOptions = useMemo(() => {
    return buildStationFilterOperatorOptions(stations, stationFilters.operatorIds);
  }, [stationFilters.operatorIds, stations]);

  useEffect(() => {
    configureMapboxSdk(resolvedMapboxToken);
  }, [resolvedMapboxToken]);

  useEffect(() => {
    let isMounted = true;

    async function refreshStations(): Promise<void> {
      try {
        const normalizedSearchQuery = normalizeStationSearchQuery(debouncedSearchQuery);
        const hasActiveSearchQuery = normalizedSearchQuery.length > 0;
        const nearbyStations = hasActiveSearchQuery
          ? await stationsApiClient.searchStations(
              buildStationSearchQuery(normalizedSearchQuery, queryCoordinates),
            )
          : await stationsApiClient.getNearbyStations(
              buildNearbyStationsQuery(stationFilters, queryCoordinates),
            );

        if (!isMounted) {
          return;
        }

        setStations(nearbyStations);
        setHasStationLoadError(false);
      } catch {
        if (!isMounted) {
          return;
        }

        setHasStationLoadError(true);
      } finally {
        if (isMounted) {
          setIsRefreshingStations(false);
        }
      }
    }

    void refreshStations();
    const refreshTimer = setInterval(() => {
      void refreshStations();
    }, STATION_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(refreshTimer);
    };
  }, [debouncedSearchQuery, queryCoordinates, stationFilters, stationsApiClient]);

  useEffect(() => {
    if (selectedStationId === null) {
      return;
    }

    const selectedStationExists = stations.some((station) => station.id === selectedStationId);

    if (!selectedStationExists) {
      setSelectedStationId(null);
    }
  }, [selectedStationId, stations]);

  const stationFeatureCollection = useMemo(() => {
    return buildStationFeatureCollection(stations);
  }, [stations]);

  const selectedStation = useMemo(() => {
    return stations.find((station) => station.id === selectedStationId) ?? null;
  }, [selectedStationId, stations]);
  const isSelectedStationFavorite = useMemo(() => {
    if (selectedStation === null) {
      return false;
    }

    return favoriteStationIds.includes(selectedStation.id);
  }, [favoriteStationIds, selectedStation]);

  useEffect(() => {
    let isMounted = true;

    if (selectedStationId === null) {
      setSelectedStationDetail(null);
      setIsLoadingSelectedStationDetail(false);
      setHasSelectedStationDetailLoadError(false);

      return () => {
        isMounted = false;
      };
    }

    const selectedStationIdSnapshot = selectedStationId;

    setIsLoadingSelectedStationDetail(true);
    setHasSelectedStationDetailLoadError(false);

    /**
     * Loads station detail payload for the currently selected station id.
     */
    async function refreshSelectedStationDetail(): Promise<void> {
      try {
        const stationDetail = await stationsApiClient.getStationDetail(selectedStationIdSnapshot, {
          connectorTypes:
            stationFilters.connectorTypes.length > 0 ? stationFilters.connectorTypes : undefined,
          latitude: queryCoordinates.latitude,
          longitude: queryCoordinates.longitude,
          minimumPowerKw: stationFilters.minimumPowerKw,
        });

        if (!isMounted) {
          return;
        }

        setSelectedStationDetail(stationDetail);
      } catch {
        if (!isMounted) {
          return;
        }

        setHasSelectedStationDetailLoadError(true);
        setSelectedStationDetail(null);
      } finally {
        if (isMounted) {
          setIsLoadingSelectedStationDetail(false);
        }
      }
    }

    void refreshSelectedStationDetail();

    return () => {
      isMounted = false;
    };
  }, [queryCoordinates, selectedStationId, stationFilters, stationsApiClient]);

  const stationStatusColorExpression = useMemo(() => {
    return buildStationMarkerColorExpression();
  }, []);

  const connectorCountTextExpression = useMemo(() => {
    return buildConnectorCountTextExpression();
  }, []);

  const handleShapeSourcePress = (event: unknown): void => {
    const stationId = extractStationIdFromShapePressEvent(event);

    if (stationId !== null) {
      setSelectedStationId(stationId);

      const nextSelectedStation = stations.find((station) => station.id === stationId);

      if (nextSelectedStation) {
        setCameraState(buildFocusedStationCameraState(nextSelectedStation));
      }
    }
  };

  const handleRecenterMapPress = (): void => {
    setCameraState(buildDefaultMapCameraState(deviceCoordinates));
  };

  const handleFocusSelectedStationPress = (): void => {
    if (!selectedStation) {
      return;
    }

    setCameraState(buildFocusedStationCameraState(selectedStation));
  };

  const handleCloseBottomSheetPress = (): void => {
    setSelectedStationId(null);
  };

  /**
   * Saves or removes one station favorite optimistically (local MMKV first)
   * and synchronizes the change with the server for signed-in users.
   */
  const handleToggleFavoriteStation = (station: StationNearbyResponse): void => {
    setHasFavoriteSyncError(false);

    void favoritesSync.toggleFavorite(station).then((result) => {
      if (result.status === 'ERROR') {
        setHasFavoriteSyncError(true);
      }
    });
  };

  /**
   * Navigates to the full station detail route from the bottom sheet CTA.
   */
  const handleNavigateToStationDetailPress = (stationId: string): void => {
    router.push(`/stations/${stationId}`);
  };

  const handleOfflineDownloadPress = (): void => {
    void downloadStationOfflineRegion(setOfflineDownloadStatus);
  };

  const handleToggleFilterPanel = useCallback((): void => {
    const nextVisible = !isFilterPanelVisible;
    setIsFilterPanelVisible(nextVisible);

    if (isJestRuntime()) {
      filterPanelAnimProgress.setValue(nextVisible ? 1 : 0);
      return;
    }

    Animated.timing(filterPanelAnimProgress, {
      duration: FILTER_PANEL_ANIM_DURATION_MS,
      toValue: nextVisible ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [filterPanelAnimProgress, isFilterPanelVisible]);

  const filterPanelMaxHeight = filterPanelAnimProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 500],
  });

  const filterPanelOpacity = filterPanelAnimProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View className="flex-1 bg-background" testID="stations-screen">
      <View className="border-b border-border bg-neutral-0 px-5 py-4">
        <Text accessibilityRole="header" className="mb-1.5 text-[22px] font-bold text-neutral-900">
          {t('stations.title')}
        </Text>
        <Text className="text-sm text-neutral-700">{t('stations.subtitle')}</Text>
      </View>

      {!resolvedMapboxToken ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-[15px] text-neutral-900">
            {t('stations.map.missingToken')}
          </Text>
        </View>
      ) : (
        <View className="flex-1">
          <Mapbox.MapView
            style={MAP_VIEW_STYLE}
            styleURL={Mapbox.StyleURL.Street}
            testID="stations-map"
          >
            <Mapbox.Camera
              centerCoordinate={cameraState.centerCoordinate}
              zoomLevel={cameraState.zoomLevel}
            />
            <Mapbox.ShapeSource
              cluster
              clusterMaxZoomLevel={14}
              clusterRadius={42}
              id="station-shape-source"
              onPress={handleShapeSourcePress}
              shape={stationFeatureCollection}
              testID="station-shape-source"
            >
              <Mapbox.CircleLayer
                filter={CLUSTER_FILTER}
                id="station-clusters-circle"
                style={{
                  circleColor: CLUSTER_COLOR_EXPRESSION as unknown as string,
                  circleRadius: CLUSTER_RADIUS_EXPRESSION as unknown as number,
                }}
              />
              <Mapbox.SymbolLayer
                filter={CLUSTER_FILTER}
                id="station-clusters-count"
                style={{
                  textColor: NEUTRAL_0,
                  textField: CLUSTER_COUNT_EXPRESSION as unknown as string,
                  textSize: 12,
                }}
              />
              {/* Layer 1: Status circle */}
              <Mapbox.CircleLayer
                filter={UNCLUSTERED_FILTER}
                id="station-marker-circle"
                style={{
                  circleColor: stationStatusColorExpression as unknown as string,
                  circleRadius: 14,
                  circleStrokeColor: NEUTRAL_0,
                  circleStrokeWidth: 2,
                }}
              />
              {/* Layer 2: Power tier badge (AC / DC / HPC) */}
              <Mapbox.SymbolLayer
                filter={UNCLUSTERED_FILTER}
                id="station-marker-power-tier"
                style={{
                  textAllowOverlap: true,
                  textColor: NEUTRAL_0,
                  textField: ['get', 'powerTier'] as unknown as string,
                  textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                  textSize: 9,
                }}
              />
              {/* Layer 3: Connector count (top-right offset label) */}
              <Mapbox.SymbolLayer
                filter={UNCLUSTERED_FILTER}
                id="station-marker-connector-count"
                style={{
                  textAllowOverlap: true,
                  textColor: NEUTRAL_900,
                  textField: connectorCountTextExpression as unknown as string,
                  textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                  textHaloColor: NEUTRAL_0,
                  textHaloWidth: 1.5,
                  textOffset: [0.9, -0.9] as unknown as number[],
                  textSize: 9,
                }}
              />
            </Mapbox.ShapeSource>
            {selectedStation ? (
              <Mapbox.MarkerView
                allowOverlap
                allowOverlapWithPuck
                anchor={{ x: 0.5, y: 0.5 }}
                coordinate={[selectedStation.longitude, selectedStation.latitude]}
                isSelected
              >
                <StationMarker
                  connectorCount={selectedStation.connectorCount}
                  powerTier={derivePowerTier(selectedStation.maxPowerKw)}
                  status={selectedStation.status}
                  title={selectedStation.name}
                />
              </Mapbox.MarkerView>
            ) : null}
          </Mapbox.MapView>
          <View className="absolute left-4 right-4 top-4 items-start">
            <StationSearchInput value={searchInputValue} onChangeText={setSearchInputValue} />
            <Pressable
              accessibilityRole="button"
              onPress={handleToggleFilterPanel}
              className="mb-2 flex-row items-center rounded-full border border-border bg-neutral-0/95 px-3.5 py-2 active:opacity-75"
              testID="station-filter-toggle-button"
            >
              <Text className="text-[13px] font-bold text-neutral-900">
                {isFilterPanelVisible
                  ? t('stations.map.filters.toggleHide')
                  : t('stations.map.filters.toggle')}
              </Text>
              {!isFilterPanelVisible && hasAnyActiveFilters(stationFilters) ? (
                <View
                  className="ml-1.5 h-2.5 w-2.5 rounded-full bg-success"
                  testID="station-filter-active-dot"
                />
              ) : null}
            </Pressable>
            <Animated.View
              className="w-full overflow-hidden"
              style={{ maxHeight: filterPanelMaxHeight, opacity: filterPanelOpacity }}
            >
              <StationFilters
                filters={stationFilters}
                operators={stationFilterOperatorOptions}
                onChange={setStationFilters}
              />
            </Animated.View>
            <Pressable
              accessibilityRole="button"
              disabled={offlineDownloadStatus === 'IN_PROGRESS'}
              onPress={handleOfflineDownloadPress}
              className={`mb-2 rounded-full bg-neutral-900 px-3.5 py-2 active:opacity-75 ${
                offlineDownloadStatus === 'IN_PROGRESS' ? 'opacity-60' : ''
              }`}
            >
              <Text className="text-xs font-bold text-neutral-0">
                {t('stations.map.offline.download')}
              </Text>
            </Pressable>
            <Text className={STATUS_PILL_CLASS}>
              {resolveOfflineStatusLabel(offlineDownloadStatus, t)}
            </Text>
            {isRefreshingStations ? (
              <Text className={STATUS_PILL_CLASS} testID="stations-loading-indicator">
                {t('stations.map.loading')}
              </Text>
            ) : null}
            {hasStationLoadError ? (
              <Text className={STATUS_PILL_CLASS} testID="stations-load-error">
                {t('stations.map.refreshError')}
              </Text>
            ) : null}
            {!isRefreshingStations && !hasStationLoadError && stations.length === 0 ? (
              <Text className={STATUS_PILL_CLASS} testID="stations-empty-state">
                {t('stations.map.empty')}
              </Text>
            ) : null}
            {hasFavoriteSyncError ? (
              <Text className={STATUS_PILL_CLASS} testID="favorites-sync-error">
                {t('favorites.sync.error')}
              </Text>
            ) : null}
          </View>
          <View className="absolute bottom-[120px] right-4 items-end">
            <Pressable
              accessibilityRole="button"
              disabled={selectedStation === null}
              onPress={handleFocusSelectedStationPress}
              className={`mb-2 rounded-full bg-neutral-900/95 px-3.5 py-2 active:opacity-75 ${
                selectedStation === null ? 'opacity-50' : ''
              }`}
              testID="station-focus-camera-button"
            >
              <Text className="text-xs font-bold text-neutral-0">
                {t('stations.map.camera.focusSelected')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleRecenterMapPress}
              className="mb-2 rounded-full bg-neutral-900/95 px-3.5 py-2 active:opacity-75"
              testID="station-recenter-camera-button"
            >
              <Text className="text-xs font-bold text-neutral-0">
                {t('stations.map.camera.recenter')}
              </Text>
            </Pressable>
          </View>
          {selectedStation ? (
            <StationBottomSheet
              hasActiveConnectorFilters={
                stationFilters.connectorTypes.length > 0 ||
                stationFilters.minimumPowerKw !== undefined
              }
              hasDetailLoadError={hasSelectedStationDetailLoadError}
              isFavorite={isSelectedStationFavorite}
              isLoadingDetail={isLoadingSelectedStationDetail}
              station={selectedStation}
              stationDetail={selectedStationDetail}
              onClose={handleCloseBottomSheetPress}
              onNavigateToDetail={handleNavigateToStationDetailPress}
              onToggleFavorite={handleToggleFavoriteStation}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * Normalizes free-text station search input for consistent API querying.
 */
function normalizeStationSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Builds the nearby-stations request payload with optional active filter fields.
 */
function buildNearbyStationsQuery(
  filters: StationFilterState,
  coordinates: StationQueryCoordinates,
): NearbyStationsQueryRequest {
  return {
    availabilityStatuses:
      filters.availabilityStatuses.length > 0 ? filters.availabilityStatuses : undefined,
    connectorTypes: filters.connectorTypes.length > 0 ? filters.connectorTypes : undefined,
    latitude: coordinates.latitude,
    limit: DEFAULT_NEARBY_STATIONS_QUERY.limit,
    longitude: coordinates.longitude,
    minimumPowerKw: filters.minimumPowerKw,
    operatorIds: filters.operatorIds.length > 0 ? filters.operatorIds : undefined,
    radiusMeters: DEFAULT_NEARBY_STATIONS_QUERY.radiusMeters,
  };
}

/**
 * Builds a station search query payload anchored to the device position when available,
 * falling back to the default Yerevan map center.
 */
function buildStationSearchQuery(
  query: string,
  coordinates: StationQueryCoordinates,
): StationSearchQueryRequest {
  return {
    latitude: coordinates.latitude,
    limit: DEFAULT_STATION_SEARCH_LIMIT,
    longitude: coordinates.longitude,
    query,
  };
}

/**
 * Extracts station ids from favorite-station records for membership lookups.
 */
function extractFavoriteStationIds(favorites: readonly FavoriteStation[]): readonly string[] {
  return favorites.map((favorite) => favorite.stationId);
}

/**
 * Builds unique and stable operator chip options from loaded stations and selected filter ids.
 */
function buildStationFilterOperatorOptions(
  stations: readonly StationNearbyResponse[],
  selectedOperatorIds: readonly string[],
): readonly StationFilterOperatorOption[] {
  const operatorNameById = new Map<string, string>();

  for (const station of stations) {
    operatorNameById.set(station.operatorId, station.operatorName);
  }

  for (const selectedOperatorId of selectedOperatorIds) {
    if (!operatorNameById.has(selectedOperatorId)) {
      operatorNameById.set(selectedOperatorId, selectedOperatorId);
    }
  }

  const operators = Array.from(operatorNameById.entries()).map(([id, name]) => {
    return { id, name };
  });

  return operators.sort((leftOperator, rightOperator) => {
    return leftOperator.name.localeCompare(rightOperator.name);
  });
}

/**
 * Reads EXPO_PUBLIC_MAPBOX_TOKEN from the Expo runtime global process env when available.
 */
function resolveMapboxTokenFromGlobalEnv(): string | undefined {
  const globalWithProcess = globalThis as {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>;
    };
  };

  return globalWithProcess.process?.env?.EXPO_PUBLIC_MAPBOX_TOKEN;
}

/**
 * Downloads the default Yerevan map region for offline station browsing.
 */
async function downloadStationOfflineRegion(
  setOfflineDownloadStatus: (status: OfflineDownloadStatus) => void,
): Promise<void> {
  setOfflineDownloadStatus('IN_PROGRESS');

  try {
    await downloadOfflineTiles(DEFAULT_OFFLINE_TILE_REGION);
    setOfflineDownloadStatus('SUCCESS');
  } catch {
    setOfflineDownloadStatus('ERROR');
  }
}

/**
 * Maps offline download state to localized status text.
 */
function resolveOfflineStatusLabel(
  status: OfflineDownloadStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case 'IN_PROGRESS':
      return t('stations.map.offline.inProgress');
    case 'SUCCESS':
      return t('stations.map.offline.success');
    case 'ERROR':
      return t('stations.map.offline.error');
    case 'IDLE':
    default:
      return t('stations.map.offline.idle');
  }
}


/**
 * Builds the default map camera state centered on the device position when available,
 * falling back to the Yerevan city center.
 */
function buildDefaultMapCameraState(
  coordinates: StationQueryCoordinates | null = null,
): MapCameraState {
  return {
    centerCoordinate: coordinates
      ? [coordinates.longitude, coordinates.latitude]
      : DEFAULT_CAMERA_CENTER,
    zoomLevel: DEFAULT_CAMERA_ZOOM_LEVEL,
  };
}

/**
 * Builds a focused map camera state around a specific station marker.
 */
function buildFocusedStationCameraState(station: StationNearbyResponse): MapCameraState {
  return {
    centerCoordinate: [station.longitude, station.latitude],
    zoomLevel: FOCUSED_STATION_CAMERA_ZOOM_LEVEL,
  };
}
