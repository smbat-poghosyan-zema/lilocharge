import type {
  NearbyStationsQueryRequest,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from '../onboarding/session-storage';

/**
 * Typed API contract for mobile station discovery operations.
 */
export interface StationsApi {
  getNearbyStations(query: NearbyStationsQueryRequest): Promise<StationNearbyResponse[]>;
  searchStations(query: StationSearchQueryRequest): Promise<StationNearbyResponse[]>;
  getStationDetail(
    stationId: string,
    query?: StationDetailQueryRequest,
  ): Promise<StationDetailResponse>;
}

/**
 * Creates station discovery API helpers backed by the shared typed ApiClient.
 */
export function createStationsApi(apiClient: ApiClient): StationsApi {
  return {
    getNearbyStations: (query: NearbyStationsQueryRequest): Promise<StationNearbyResponse[]> => {
      return apiClient.get<StationNearbyResponse[]>('/stations/nearby', {
        query: buildNearbyStationsQueryParameters(query),
      });
    },
    searchStations: (query: StationSearchQueryRequest): Promise<StationNearbyResponse[]> => {
      return apiClient.get<StationNearbyResponse[]>('/stations/search', {
        query: {
          latitude: query.latitude,
          limit: query.limit,
          longitude: query.longitude,
          query: query.query,
        },
      });
    },
    getStationDetail: (
      stationId: string,
      query: StationDetailQueryRequest = {},
    ): Promise<StationDetailResponse> => {
      return apiClient.get<StationDetailResponse>(`/stations/${stationId}`, {
        query: {
          connectorTypes: serializeQueryArray(query.connectorTypes),
          latitude: query.latitude,
          longitude: query.longitude,
          minimumPowerKw: query.minimumPowerKw,
        },
      });
    },
  };
}

const defaultStationsApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/**
 * Default station API instance for map-based station discovery.
 */
export const stationsApi = createStationsApi(defaultStationsApiClient);

/**
 * Serializes station-discovery filter arrays into API query-string friendly fields.
 */
function buildNearbyStationsQueryParameters(
  query: NearbyStationsQueryRequest,
): Readonly<Record<string, boolean | number | string | null | undefined>> {
  return {
    availabilityStatuses: serializeQueryArray(query.availabilityStatuses),
    connectorTypes: serializeQueryArray(query.connectorTypes),
    latitude: query.latitude,
    limit: query.limit,
    longitude: query.longitude,
    minimumPowerKw: query.minimumPowerKw,
    operatorIds: serializeQueryArray(query.operatorIds),
    radiusMeters: query.radiusMeters,
  };
}

/**
 * Converts array query values into comma-separated strings accepted by the API client.
 */
function serializeQueryArray(values: readonly string[] | undefined): string | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  return values.join(',');
}
