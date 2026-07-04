import type {
  NearbyStationsQueryRequest,
  StationConnectorResponse,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationPricingPlanResponse,
  StationReviewResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConnectorType as PrismaConnectorType,
  StationStatus as PrismaStationStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import {
  buildNearbyStationsQuery,
  buildSearchStationsQuery,
  buildStationDetailQuery,
} from './stations.queries';

const DEFAULT_NEARBY_LIMIT = 50;
const DEFAULT_NEARBY_RADIUS_METERS = 5000;
const DEFAULT_SEARCH_LIMIT = 20;
const STATION_NOT_FOUND_MESSAGE = 'Station not found';

interface NearbyStationRawRow {
  readonly address: string;
  readonly amenities: readonly string[];
  readonly city: string;
  readonly connectorCount: number;
  readonly distanceMeters: number | string;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly maxPowerKw: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly status: PrismaStationStatus;
}

interface StationDetailConnectorRawValue {
  readonly connectorType: PrismaConnectorType;
  readonly createdAt: Date | string;
  readonly evseId: string;
  readonly id: string;
  readonly lastStatusUpdate: Date | string;
  readonly powerKw: number;
  readonly stationId: string;
  readonly status: PrismaStationStatus;
  readonly updatedAt: Date | string;
}

interface StationDetailPricingPlanRawValue {
  readonly connectorId: string;
  readonly createdAt: Date | string;
  readonly id: string;
  readonly idleFee: number | null;
  readonly name: string;
  readonly pricePerKwh: number | null;
  readonly pricePerMinute: number | null;
  readonly sessionFee: number | null;
  readonly updatedAt: Date | string;
  readonly validFrom: Date | string;
  readonly validUntil: Date | string | null;
}

interface StationDetailReviewRawValue {
  readonly comment: string | null;
  readonly createdAt: Date | string;
  readonly id: string;
  readonly photos: readonly string[];
  readonly rating: number;
  readonly stationId: string;
  readonly updatedAt: Date | string;
  readonly userId: string;
}

interface StationDetailRawRow {
  readonly address: string;
  readonly amenities: readonly string[];
  readonly averageRating: number | string | null;
  readonly city: string;
  readonly connectors: readonly StationDetailConnectorRawValue[];
  readonly createdAt: Date | string;
  readonly distanceMeters: number | string | null;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly pricingPlans: readonly StationDetailPricingPlanRawValue[];
  readonly reviewCount: number | string;
  readonly reviews: readonly StationDetailReviewRawValue[];
  readonly status: PrismaStationStatus;
  readonly updatedAt: Date | string;
}

/** Service implementing station discovery and detail retrieval endpoints. */
@Injectable()
export class StationsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /** Finds stations near a coordinate using PostGIS ST_DWithin and distance ordering. */
  public async findNearbyStations(
    request: NearbyStationsQueryRequest,
  ): Promise<StationNearbyResponse[]> {
    const cacheKey = buildNearbyCacheKey(request);
    const cached = await this.cacheService.getNearbyStations<StationNearbyResponse[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const query = buildNearbyStationsQuery({
      availabilityStatuses: request.availabilityStatuses,
      connectorTypes: request.connectorTypes,
      latitude: request.latitude,
      limit: request.limit ?? DEFAULT_NEARBY_LIMIT,
      longitude: request.longitude,
      minimumPowerKw: request.minimumPowerKw,
      operatorIds: request.operatorIds,
      radiusMeters: request.radiusMeters ?? DEFAULT_NEARBY_RADIUS_METERS,
    });

    const stations = await this.prismaService.$queryRaw<NearbyStationRawRow[]>(query);
    const results = stations.map((station) => mapNearbyStationRawRowToResponse(station));

    await this.cacheService.cacheNearbyStations(cacheKey, results);

    return results;
  }

  /** Finds stations by fuzzy tri-lingual name and address search using pg_trgm similarity. */
  public async searchStations(
    request: StationSearchQueryRequest,
  ): Promise<StationNearbyResponse[]> {
    const normalizedSearchQuery = normalizeStationSearchQuery(request.query);

    if (normalizedSearchQuery.length === 0) {
      return [];
    }

    const cacheKey = buildSearchCacheKey(request, normalizedSearchQuery);
    const cached = await this.cacheService.getStationSearch<StationNearbyResponse[]>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const query = buildSearchStationsQuery({
      latitude: request.latitude,
      limit: request.limit ?? DEFAULT_SEARCH_LIMIT,
      longitude: request.longitude,
      query: normalizedSearchQuery,
    });
    const stations = await this.prismaService.$queryRaw<NearbyStationRawRow[]>(query);
    const results = stations.map((station) => mapNearbyStationRawRowToResponse(station));

    await this.cacheService.cacheStationSearch(cacheKey, results);

    return results;
  }

  /** Returns one station detail payload with connectors, pricing plans, review aggregates, and optional distance. */
  public async getStationDetail(
    stationId: string,
    query: StationDetailQueryRequest = {},
  ): Promise<StationDetailResponse> {
    const hasConnectorFilters =
      (query.connectorTypes !== undefined && query.connectorTypes.length > 0) ||
      query.minimumPowerKw !== undefined;
    const hasLocationContext = query.latitude !== undefined || query.longitude !== undefined;
    const isCacheable = !hasConnectorFilters && !hasLocationContext;

    if (isCacheable) {
      const cached = await this.cacheService.getStationDetail<StationDetailResponse>(stationId);

      if (cached !== null) {
        return cached;
      }
    }

    const detailQuery = buildStationDetailQuery({
      connectorTypes: query.connectorTypes,
      latitude: query.latitude,
      longitude: query.longitude,
      minimumPowerKw: query.minimumPowerKw,
      stationId,
    });

    const rows = await this.prismaService.$queryRaw<StationDetailRawRow[]>(detailQuery);
    const station = rows[0];

    if (station === undefined) {
      throw new NotFoundException(STATION_NOT_FOUND_MESSAGE);
    }

    const result = mapStationDetailRawRowToResponse(station);

    if (isCacheable) {
      await this.cacheService.cacheStationDetail(stationId, result);
    }

    return result;
  }
}

/** Maps Prisma station status values to the shared status enum. */
function mapPrismaStationStatusToSharedEnum(status: PrismaStationStatus): StationStatus {
  switch (status) {
    case PrismaStationStatus.OCCUPIED:
      return StationStatus.OCCUPIED;
    case PrismaStationStatus.OFFLINE:
      return StationStatus.OFFLINE;
    case PrismaStationStatus.MAINTENANCE:
      return StationStatus.MAINTENANCE;
    case PrismaStationStatus.AVAILABLE:
    default:
      return StationStatus.AVAILABLE;
  }
}

/** Maps Prisma connector type enum values to the shared connector type enum. */
function mapPrismaConnectorTypeToSharedEnum(connectorType: PrismaConnectorType): ConnectorType {
  switch (connectorType) {
    case PrismaConnectorType.TYPE_1:
      return ConnectorType.TYPE_1;
    case PrismaConnectorType.TYPE_2:
      return ConnectorType.TYPE_2;
    case PrismaConnectorType.CHADEMO:
      return ConnectorType.CHADEMO;
    case PrismaConnectorType.TESLA:
      return ConnectorType.TESLA;
    case PrismaConnectorType.GBT:
      return ConnectorType.GBT;
    case PrismaConnectorType.CCS:
    default:
      return ConnectorType.CCS;
  }
}

/** Maps a PostGIS nearby-search row into a shared nearby station response payload. */
function mapNearbyStationRawRowToResponse(station: NearbyStationRawRow): StationNearbyResponse {
  return {
    address: station.address,
    amenities: station.amenities,
    city: station.city,
    connectorCount: station.connectorCount,
    distanceMeters: normalizeDistanceMeters(station.distanceMeters),
    id: station.id,
    latitude: station.latitude,
    longitude: station.longitude,
    maxPowerKw: station.maxPowerKw,
    name: station.name,
    openingHours: station.openingHours,
    operatorId: station.operatorId,
    operatorName: station.operatorName,
    status: mapPrismaStationStatusToSharedEnum(station.status),
  };
}

/** Maps one aggregated station detail SQL row into the shared station detail response payload. */
function mapStationDetailRawRowToResponse(station: StationDetailRawRow): StationDetailResponse {
  return {
    address: station.address,
    amenities: station.amenities,
    averageRating: normalizeNullableNumber(station.averageRating),
    city: station.city,
    connectors: station.connectors.map((connector) => mapConnectorRawValueToResponse(connector)),
    createdAt: normalizeDateToIso(station.createdAt),
    distanceMeters: normalizeNullableDistanceMeters(station.distanceMeters),
    id: station.id,
    latitude: station.latitude,
    longitude: station.longitude,
    name: station.name,
    openingHours: station.openingHours,
    operatorId: station.operatorId,
    operatorName: station.operatorName,
    pricingPlans: station.pricingPlans.map((pricingPlan) => {
      return mapPricingPlanRawValueToResponse(pricingPlan);
    }),
    reviewCount: normalizeReviewCount(station.reviewCount),
    reviews: station.reviews.map((review) => mapReviewRawValueToResponse(review)),
    status: mapPrismaStationStatusToSharedEnum(station.status),
    updatedAt: normalizeDateToIso(station.updatedAt),
  };
}

/** Maps one connector raw aggregate value into the shared connector response payload. */
function mapConnectorRawValueToResponse(
  connector: StationDetailConnectorRawValue,
): StationConnectorResponse {
  return {
    connectorType: mapPrismaConnectorTypeToSharedEnum(connector.connectorType),
    createdAt: normalizeDateToIso(connector.createdAt),
    evseId: connector.evseId,
    id: connector.id,
    lastStatusUpdate: normalizeDateToIso(connector.lastStatusUpdate),
    powerKw: connector.powerKw,
    stationId: connector.stationId,
    status: mapPrismaStationStatusToSharedEnum(connector.status),
    updatedAt: normalizeDateToIso(connector.updatedAt),
  };
}

/** Maps one pricing-plan raw aggregate value into the shared pricing-plan response payload. */
function mapPricingPlanRawValueToResponse(
  pricingPlan: StationDetailPricingPlanRawValue,
): StationPricingPlanResponse {
  return {
    connectorId: pricingPlan.connectorId,
    createdAt: normalizeDateToIso(pricingPlan.createdAt),
    id: pricingPlan.id,
    idleFee: pricingPlan.idleFee,
    name: pricingPlan.name,
    pricePerKwh: pricingPlan.pricePerKwh,
    pricePerMinute: pricingPlan.pricePerMinute,
    sessionFee: pricingPlan.sessionFee,
    updatedAt: normalizeDateToIso(pricingPlan.updatedAt),
    validFrom: normalizeDateToIso(pricingPlan.validFrom),
    validUntil: normalizeNullableDateToIso(pricingPlan.validUntil),
  };
}

/** Maps one review raw aggregate value into the shared station review response payload. */
function mapReviewRawValueToResponse(review: StationDetailReviewRawValue): StationReviewResponse {
  return {
    comment: review.comment,
    createdAt: normalizeDateToIso(review.createdAt),
    id: review.id,
    photos: review.photos,
    rating: review.rating,
    stationId: review.stationId,
    updatedAt: normalizeDateToIso(review.updatedAt),
    userId: review.userId,
  };
}

/** Normalizes station search input by trimming and collapsing repeated whitespace. */
function normalizeStationSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

/** Normalizes raw ST_Distance values to finite numbers for API responses. */
function normalizeDistanceMeters(distance: number | string): number {
  const normalizedDistance = typeof distance === 'number' ? distance : Number(distance);

  if (!Number.isFinite(normalizedDistance)) {
    throw new Error('Invalid station distance value returned by database query');
  }

  return normalizedDistance;
}

/** Normalizes optional raw ST_Distance values to finite numbers or null. */
function normalizeNullableDistanceMeters(distance: number | string | null): number | null {
  if (distance === null) {
    return null;
  }

  return normalizeDistanceMeters(distance);
}

/** Normalizes nullable numeric database values to finite numbers or null. */
function normalizeNullableNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(normalizedValue)) {
    throw new Error('Invalid numeric value returned by database query');
  }

  return normalizedValue;
}

/** Normalizes aggregate review counts into non-negative integer values. */
function normalizeReviewCount(reviewCount: number | string): number {
  const normalizedReviewCount = typeof reviewCount === 'number' ? reviewCount : Number(reviewCount);

  if (!Number.isInteger(normalizedReviewCount) || normalizedReviewCount < 0) {
    throw new Error('Invalid station review count value returned by database query');
  }

  return normalizedReviewCount;
}

/** Converts raw date values into ISO strings and validates timestamp correctness. */
function normalizeDateToIso(value: Date | string): string {
  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date value returned by database query');
  }

  return parsedDate.toISOString();
}

/** Converts nullable raw date values into ISO strings while preserving nulls. */
function normalizeNullableDateToIso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return normalizeDateToIso(value);
}

/**
 * Builds a deterministic cache key for nearby station queries.
 *
 * @param request - Nearby stations query parameters
 * @returns Cache key string
 */
function buildNearbyCacheKey(request: NearbyStationsQueryRequest): string {
  const parts: string[] = [
    `lat:${request.latitude.toFixed(6)}`,
    `lng:${request.longitude.toFixed(6)}`,
    `r:${request.radiusMeters ?? DEFAULT_NEARBY_RADIUS_METERS}`,
    `l:${request.limit ?? DEFAULT_NEARBY_LIMIT}`,
  ];

  if (request.connectorTypes !== undefined && request.connectorTypes.length > 0) {
    parts.push(`ct:${[...request.connectorTypes].sort().join(',')}`);
  }

  if (request.minimumPowerKw !== undefined) {
    parts.push(`mp:${request.minimumPowerKw}`);
  }

  if (request.availabilityStatuses !== undefined && request.availabilityStatuses.length > 0) {
    parts.push(`as:${[...request.availabilityStatuses].sort().join(',')}`);
  }

  if (request.operatorIds !== undefined && request.operatorIds.length > 0) {
    parts.push(`op:${[...request.operatorIds].sort().join(',')}`);
  }

  return parts.join('|');
}

/**
 * Builds a deterministic cache key for station search queries.
 *
 * @param request - Station search query parameters
 * @param normalizedQuery - Normalized search query string
 * @returns Cache key string
 */
function buildSearchCacheKey(request: StationSearchQueryRequest, normalizedQuery: string): string {
  const parts: string[] = [
    `q:${normalizedQuery}`,
    `lat:${request.latitude.toFixed(6)}`,
    `lng:${request.longitude.toFixed(6)}`,
    `l:${request.limit ?? DEFAULT_SEARCH_LIMIT}`,
  ];

  return parts.join('|');
}
