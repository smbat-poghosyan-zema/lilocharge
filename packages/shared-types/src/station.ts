import { ConnectorType } from './vehicle';

/** Supported availability states shared by stations and their connectors. */
export enum StationStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  OFFLINE = 'OFFLINE',
  MAINTENANCE = 'MAINTENANCE',
}

/** Priority order for aggregate station status computation (lower value = higher priority). */
export const STATION_STATUS_PRIORITY: Record<StationStatus, number> = {
  [StationStatus.AVAILABLE]: 0,
  [StationStatus.OCCUPIED]: 1,
  [StationStatus.MAINTENANCE]: 2,
  [StationStatus.OFFLINE]: 3,
};

/**
 * Computes the best (highest priority) status from an array of connector statuses.
 * If ANY connector is AVAILABLE, the station is AVAILABLE.
 * If no connector is AVAILABLE but at least one is OCCUPIED, the station is OCCUPIED.
 * If all connectors are MAINTENANCE, the station is MAINTENANCE.
 * If all connectors are OFFLINE (or there are none), the station is OFFLINE.
 */
export function computeAggregateStationStatus(
  connectorStatuses: readonly StationStatus[],
): StationStatus {
  if (connectorStatuses.length === 0) {
    return StationStatus.OFFLINE;
  }

  let bestStatus = StationStatus.OFFLINE;
  let bestPriority = STATION_STATUS_PRIORITY[StationStatus.OFFLINE];

  for (const status of connectorStatuses) {
    const priority = STATION_STATUS_PRIORITY[status];

    if (priority < bestPriority) {
      bestPriority = priority;
      bestStatus = status;
    }
  }

  return bestStatus;
}

/** Query parameters accepted by the nearby station search endpoint. */
export interface NearbyStationsQueryRequest {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters?: number;
  readonly limit?: number;
  readonly connectorTypes?: readonly ConnectorType[];
  readonly minimumPowerKw?: number;
  readonly availabilityStatuses?: readonly StationStatus[];
  readonly operatorIds?: readonly string[];
}

/** Query parameters accepted by fuzzy station search across tri-lingual station text fields. */
export interface StationSearchQueryRequest {
  readonly query: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly limit?: number;
}

/** Power tier derived from the maximum connector power at a station. */
export type PowerTier = 'AC' | 'DC' | 'HPC';

/**
 * Derives the power tier label from the maximum connector power in kilowatts.
 *
 * - AC:  maxPowerKw <= 22
 * - DC:  maxPowerKw <= 100
 * - HPC: maxPowerKw > 100
 */
export function derivePowerTier(maxPowerKw: number): PowerTier {
  if (maxPowerKw <= 22) {
    return 'AC';
  }

  if (maxPowerKw <= 100) {
    return 'DC';
  }

  return 'HPC';
}

/** Compact station payload returned by nearby station discovery queries. */
export interface StationNearbyResponse {
  readonly id: string;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: StationStatus;
  readonly openingHours: string | null;
  readonly amenities: readonly string[];
  readonly distanceMeters: number;
  /** Total number of connectors at this station. */
  readonly connectorCount: number;
  /** Maximum power output in kW across all connectors at this station. */
  readonly maxPowerKw: number;
}

/** Connector payload embedded in station detail responses. */
export interface StationConnectorResponse {
  readonly id: string;
  readonly stationId: string;
  readonly evseId: string;
  readonly connectorType: ConnectorType;
  readonly powerKw: number;
  readonly status: StationStatus;
  readonly lastStatusUpdate: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Pricing plan payload associated with connectors in station detail responses. */
export interface StationPricingPlanResponse {
  readonly id: string;
  readonly connectorId: string;
  readonly name: string;
  readonly pricePerKwh: number | null;
  readonly pricePerMinute: number | null;
  readonly sessionFee: number | null;
  readonly idleFee: number | null;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** User review payload embedded in station detail responses. */
export interface StationReviewResponse {
  readonly id: string;
  readonly stationId: string;
  readonly userId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly photos: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Optional coordinate and filter context used to compute station distance and filter-aware connector display in detail views. */
export interface StationDetailQueryRequest {
  readonly latitude?: number;
  readonly longitude?: number;
  /** Active connector-type filters forwarded from the map so the detail view can highlight matching connectors. */
  readonly connectorTypes?: readonly ConnectorType[];
  /** Active minimum-power filter forwarded from the map so the detail view can dim underpowered connectors. */
  readonly minimumPowerKw?: number;
}

/** Full station payload including connectors, pricing, reviews, and geospatial context. */
export interface StationDetailResponse {
  readonly id: string;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: StationStatus;
  readonly openingHours: string | null;
  readonly amenities: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly distanceMeters: number | null;
  readonly averageRating: number | null;
  readonly reviewCount: number;
  readonly connectors: readonly StationConnectorResponse[];
  readonly pricingPlans: readonly StationPricingPlanResponse[];
  readonly reviews: readonly StationReviewResponse[];
}
