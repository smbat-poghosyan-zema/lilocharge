import { Prisma } from '@prisma/client';
import {
  type ConnectorType,
  type StationSearchQueryRequest,
  type StationStatus,
} from '@lilocharge/shared-types';

/**
 * SQL fragment that computes aggregate station status from connector statuses.
 *
 * Priority: AVAILABLE (0) > OCCUPIED (1) > MAINTENANCE (2) > OFFLINE (3).
 * Picks the best (lowest priority number) status across all connectors.
 * Stations with no connectors default to OFFLINE.
 */
const AGGREGATE_STATUS_SQL = Prisma.sql`(
  SELECT CASE MIN(
    CASE agg_c."status"::text
      WHEN 'AVAILABLE' THEN 0
      WHEN 'OCCUPIED' THEN 1
      WHEN 'MAINTENANCE' THEN 2
      ELSE 3
    END
  )
    WHEN 0 THEN 'AVAILABLE'
    WHEN 1 THEN 'OCCUPIED'
    WHEN 2 THEN 'MAINTENANCE'
    ELSE 'OFFLINE'
  END
  FROM "connectors" agg_c
  WHERE agg_c."station_id" = s."id"
)`;

/** Parameters used to build the nearby station PostGIS SQL query. */
export interface NearbyStationsSqlParams {
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly limit: number;
  readonly connectorTypes?: readonly ConnectorType[];
  readonly minimumPowerKw?: number;
  readonly availabilityStatuses?: readonly StationStatus[];
  readonly operatorIds?: readonly string[];
}

/** Parameters used to build the fuzzy tri-lingual station search SQL query. */
export interface SearchStationsSqlParams extends StationSearchQueryRequest {
  readonly limit: number;
}

/** Parameters used to build the station detail aggregate SQL query. */
export interface StationDetailSqlParams {
  readonly stationId: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly connectorTypes?: readonly ConnectorType[];
  readonly minimumPowerKw?: number;
}

/** Builds the raw SQL query used for ST_DWithin proximity search with computed distance. */
export function buildNearbyStationsQuery(params: NearbyStationsSqlParams): Prisma.Sql {
  const { latitude, longitude, radiusMeters, limit } = params;
  const connectorFilterSql = buildConnectorFilterSql(params);
  const availabilityFilterSql = buildStationStatusFilterSql(params.availabilityStatuses);
  const operatorFilterSql = buildOperatorFilterSql(params.operatorIds);

  return Prisma.sql`
    SELECT
      s."id",
      s."operator_id" AS "operatorId",
      s."operator_name" AS "operatorName",
      s."name",
      s."address",
      s."city",
      s."latitude",
      s."longitude",
      ${AGGREGATE_STATUS_SQL} AS "status",
      s."opening_hours" AS "openingHours",
      s."amenities",
      ST_Distance(
        s."location",
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) AS "distanceMeters",
      (SELECT COUNT(*)::int FROM "connectors" cc WHERE cc."station_id" = s."id") AS "connectorCount",
      (SELECT COALESCE(MAX(mc."power_kw"), 0)::float8 FROM "connectors" mc WHERE mc."station_id" = s."id") AS "maxPowerKw"
    FROM "stations" s
    WHERE ST_DWithin(
      s."location",
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
      ${radiusMeters}
    )
      ${connectorFilterSql}
      ${availabilityFilterSql}
      ${operatorFilterSql}
    ORDER BY "distanceMeters" ASC
    LIMIT ${limit}
  `;
}

/** Builds the raw SQL query used for tri-lingual fuzzy station search with pg_trgm ranking. */
export function buildSearchStationsQuery(params: SearchStationsSqlParams): Prisma.Sql {
  const normalizedQuery = params.query.toLowerCase();
  const wildcardQuery = `%${normalizedQuery}%`;

  return Prisma.sql`
    SELECT
      s."id",
      s."operator_id" AS "operatorId",
      s."operator_name" AS "operatorName",
      s."name",
      s."address",
      s."city",
      s."latitude",
      s."longitude",
      ${AGGREGATE_STATUS_SQL} AS "status",
      s."opening_hours" AS "openingHours",
      s."amenities",
      ST_Distance(
        s."location",
        ST_SetSRID(ST_MakePoint(${params.longitude}, ${params.latitude}), 4326)::geography
      ) AS "distanceMeters",
      (SELECT COUNT(*)::int FROM "connectors" cc WHERE cc."station_id" = s."id") AS "connectorCount",
      (SELECT COALESCE(MAX(mc."power_kw"), 0)::float8 FROM "connectors" mc WHERE mc."station_id" = s."id") AS "maxPowerKw",
      GREATEST(
        similarity(LOWER(s."name"), ${normalizedQuery}),
        similarity(LOWER(s."address"), ${normalizedQuery}),
        similarity(LOWER(s."city"), ${normalizedQuery}),
        similarity(LOWER(s."operator_name"), ${normalizedQuery})
      ) AS "matchScore"
    FROM "stations" s
    WHERE
      LOWER(s."name") % ${normalizedQuery}
      OR LOWER(s."address") % ${normalizedQuery}
      OR LOWER(s."city") % ${normalizedQuery}
      OR LOWER(s."operator_name") % ${normalizedQuery}
      OR LOWER(s."name") LIKE ${wildcardQuery}
      OR LOWER(s."address") LIKE ${wildcardQuery}
      OR LOWER(s."city") LIKE ${wildcardQuery}
      OR LOWER(s."operator_name") LIKE ${wildcardQuery}
    ORDER BY "matchScore" DESC, "distanceMeters" ASC
    LIMIT ${params.limit}
  `;
}

/** Builds a station detail SQL query aggregating connectors, pricing plans, and reviews. */
export function buildStationDetailQuery(params: StationDetailSqlParams): Prisma.Sql {
  const hasDistanceContext = params.latitude !== undefined && params.longitude !== undefined;
  const detailLatitude = params.latitude ?? 0;
  const detailLongitude = params.longitude ?? 0;
  const connectorFilterSql = buildDetailConnectorFilterSql(params);

  return Prisma.sql`
    SELECT
      s."id",
      s."operator_id" AS "operatorId",
      s."operator_name" AS "operatorName",
      s."name",
      s."address",
      s."city",
      s."latitude",
      s."longitude",
      ${AGGREGATE_STATUS_SQL} AS "status",
      s."opening_hours" AS "openingHours",
      s."amenities",
      s."created_at" AS "createdAt",
      s."updated_at" AS "updatedAt",
      CASE
        WHEN ${hasDistanceContext}::boolean = false THEN NULL
        ELSE ST_Distance(
          s."location",
          ST_SetSRID(ST_MakePoint(${detailLongitude}, ${detailLatitude}), 4326)::geography
        )
      END AS "distanceMeters",
      review_data."averageRating",
      review_data."reviewCount",
      review_data."reviews",
      connector_data."connectors",
      pricing_data."pricingPlans"
    FROM "stations" s
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', c."id",
              'stationId', c."station_id",
              'evseId', c."evse_id",
              'connectorType', c."connector_type",
              'powerKw', c."power_kw",
              'status', c."status",
              'lastStatusUpdate', c."last_status_update",
              'createdAt', c."created_at",
              'updatedAt', c."updated_at"
            )
            ORDER BY c."power_kw" DESC
          ) FILTER (WHERE c."id" IS NOT NULL),
          '[]'::jsonb
        ) AS "connectors"
      FROM "connectors" c
      WHERE c."station_id" = s."id"
        ${connectorFilterSql}
    ) connector_data ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', p."id",
              'connectorId', p."connector_id",
              'name', p."name",
              'pricePerKwh', p."price_per_kwh",
              'pricePerMinute', p."price_per_minute",
              'sessionFee', p."session_fee",
              'idleFee', p."idle_fee",
              'validFrom', p."valid_from",
              'validUntil', p."valid_until",
              'createdAt', p."created_at",
              'updatedAt', p."updated_at"
            )
            ORDER BY p."valid_from" DESC
          ) FILTER (WHERE p."id" IS NOT NULL),
          '[]'::jsonb
        ) AS "pricingPlans"
      FROM "pricing_plans" p
      INNER JOIN "connectors" c ON c."id" = p."connector_id"
      WHERE c."station_id" = s."id"
        ${connectorFilterSql}
    ) pricing_data ON true
    LEFT JOIN LATERAL (
      SELECT
        AVG(r."rating")::float8 AS "averageRating",
        COUNT(r."id")::int AS "reviewCount",
        COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', r."id",
              'stationId', r."station_id",
              'userId', r."user_id",
              'rating', r."rating",
              'comment', r."comment",
              'photos', r."photos",
              'createdAt', r."created_at",
              'updatedAt', r."updated_at"
            )
            ORDER BY r."created_at" DESC
          ) FILTER (WHERE r."id" IS NOT NULL),
          '[]'::jsonb
        ) AS "reviews"
      FROM "reviews" r
      WHERE r."station_id" = s."id"
    ) review_data ON true
    WHERE s."id" = ${params.stationId}::uuid
  `;
}

/**
 * Builds an optional connector-level filter predicate for connector type and minimum power.
 */
function buildConnectorFilterSql(params: NearbyStationsSqlParams): Prisma.Sql {
  const connectorTypeFilters = params.connectorTypes ?? [];
  const connectorConditions: Prisma.Sql[] = [];

  if (connectorTypeFilters.length > 0) {
    connectorConditions.push(
      Prisma.sql`connector_filter."connector_type"::text IN (${Prisma.join(connectorTypeFilters)})`,
    );
  }

  if (params.minimumPowerKw !== undefined) {
    connectorConditions.push(Prisma.sql`connector_filter."power_kw" >= ${params.minimumPowerKw}`);
  }

  if (connectorConditions.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`
    AND EXISTS (
      SELECT 1
      FROM "connectors" connector_filter
      WHERE connector_filter."station_id" = s."id"
        AND ${Prisma.join(connectorConditions, ' AND ')}
    )
  `;
}

/**
 * Builds an optional station-status filter predicate for nearby station search.
 * Filters on the computed aggregate status derived from connector statuses.
 */
function buildStationStatusFilterSql(
  availabilityStatuses: NearbyStationsSqlParams['availabilityStatuses'],
): Prisma.Sql {
  if (!availabilityStatuses || availabilityStatuses.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`
    AND ${AGGREGATE_STATUS_SQL}::text IN (${Prisma.join(availabilityStatuses)})
  `;
}

/**
 * Builds optional connector-type and minimum-power WHERE clauses for the station detail lateral joins.
 * Used inside the connector_data and pricing_data lateral joins to narrow returned connectors.
 */
function buildDetailConnectorFilterSql(params: StationDetailSqlParams): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (params.connectorTypes && params.connectorTypes.length > 0) {
    conditions.push(
      Prisma.sql`c."connector_type"::text IN (${Prisma.join(params.connectorTypes)})`,
    );
  }

  if (params.minimumPowerKw !== undefined) {
    conditions.push(Prisma.sql`c."power_kw" >= ${params.minimumPowerKw}`);
  }

  if (conditions.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}`;
}

/**
 * Builds an optional operator-id filter predicate for nearby station search.
 */
function buildOperatorFilterSql(operatorIds: NearbyStationsSqlParams['operatorIds']): Prisma.Sql {
  if (!operatorIds || operatorIds.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`
    AND s."operator_id" IN (${Prisma.join(operatorIds)})
  `;
}
