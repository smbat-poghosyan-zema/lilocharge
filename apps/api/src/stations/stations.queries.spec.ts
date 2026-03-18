import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import {
  buildNearbyStationsQuery,
  buildSearchStationsQuery,
  buildStationDetailQuery,
} from './stations.queries';

/**
 * Extracts the flattened SQL text from a Prisma.Sql value for assertion checks.
 */
function readSqlText(query: unknown): string {
  const sqlQuery = query as {
    readonly strings?: readonly string[];
  };

  return sqlQuery.strings?.join(' ') ?? '';
}

/**
 * Extracts SQL placeholder values from a Prisma.Sql value.
 */
function readSqlValues(query: unknown): readonly unknown[] {
  const sqlQuery = query as {
    readonly values?: readonly unknown[];
  };

  return sqlQuery.values ?? [];
}

describe('stations queries', () => {
  it('builds nearby stations SQL without optional filters', () => {
    const query = buildNearbyStationsQuery({
      latitude: 40.1792,
      limit: 50,
      longitude: 44.4991,
      radiusMeters: 5000,
    });
    const sqlText = readSqlText(query);
    const sqlValues = readSqlValues(query);

    expect(sqlText).toContain('FROM "stations" s');
    expect(sqlText).not.toContain('connector_filter');
    expect(sqlText).not.toContain('s."status"::text IN');
    expect(sqlText).not.toContain('s."operator_id" IN');
    expect(sqlValues).toEqual(expect.arrayContaining([44.4991, 40.1792, 5000, 50]));
  });

  it('builds nearby stations SQL with connector, power, availability, and operator filters', () => {
    const query = buildNearbyStationsQuery({
      availabilityStatuses: [StationStatus.AVAILABLE, StationStatus.OCCUPIED],
      connectorTypes: [ConnectorType.CCS, ConnectorType.TYPE_2],
      latitude: 40.1792,
      limit: 25,
      longitude: 44.4991,
      minimumPowerKw: 120,
      operatorIds: ['lilocharge', 'operator-2'],
      radiusMeters: 8000,
    });
    const sqlText = readSqlText(query);
    const sqlValues = readSqlValues(query);

    expect(sqlText).toContain('FROM "connectors" connector_filter');
    expect(sqlText).toContain('connector_filter."connector_type"::text IN');
    expect(sqlText).toContain('connector_filter."power_kw" >=');
    expect(sqlText).toContain(')::text IN');
    expect(sqlText).toContain('s."operator_id" IN');
    expect(sqlValues).toEqual(
      expect.arrayContaining([
        ConnectorType.CCS,
        ConnectorType.TYPE_2,
        StationStatus.AVAILABLE,
        StationStatus.OCCUPIED,
        'lilocharge',
        'operator-2',
        120,
        8000,
        25,
      ]),
    );
  });

  it('builds tri-lingual fuzzy search SQL with similarity ranking and distance tiebreaker', () => {
    const query = buildSearchStationsQuery({
      latitude: 40.1792,
      limit: 15,
      longitude: 44.4991,
      query: 'kentron',
    });
    const sqlText = readSqlText(query);
    const sqlValues = readSqlValues(query);

    expect(sqlText).toContain('similarity');
    expect(sqlText).toContain('s."name"');
    expect(sqlText).toContain('s."address"');
    expect(sqlText).toContain('ORDER BY "matchScore" DESC, "distanceMeters" ASC');
    expect(sqlValues).toEqual(expect.arrayContaining(['kentron', 44.4991, 40.1792, 15]));
  });
});

describe('B1 — Aggregate status SQL CASE expression in all query builders', () => {
  it('buildNearbyStationsQuery SQL contains the CASE...WHEN EXISTS pattern for AVAILABLE', () => {
    const sql = buildNearbyStationsQuery({
      latitude: 40.18,
      limit: 50,
      longitude: 44.5,
      radiusMeters: 5000,
    });

    const sqlText = readSqlText(sql);

    expect(sqlText).toContain("WHEN 'AVAILABLE' THEN 0");
    expect(sqlText).toContain("WHEN 0 THEN 'AVAILABLE'");
    expect(sqlText).toContain("WHEN 'OCCUPIED' THEN 1");
    expect(sqlText).toContain("WHEN 1 THEN 'OCCUPIED'");
  });

  it('buildNearbyStationsQuery SQL contains fallback to OFFLINE', () => {
    const sql = buildNearbyStationsQuery({
      latitude: 40.18,
      limit: 50,
      longitude: 44.5,
      radiusMeters: 5000,
    });

    const sqlText = readSqlText(sql);

    expect(sqlText).toContain("ELSE 'OFFLINE'");
  });

  it('buildSearchStationsQuery SQL contains the same aggregate_status CASE expression', () => {
    const sql = buildSearchStationsQuery({
      latitude: 40.18,
      limit: 20,
      longitude: 44.5,
      query: 'kentron',
    });

    const sqlText = readSqlText(sql);

    expect(sqlText).toContain("WHEN 'AVAILABLE' THEN 0");
    expect(sqlText).toContain("WHEN 0 THEN 'AVAILABLE'");
    expect(sqlText).toContain("ELSE 'OFFLINE'");
  });

  it('buildStationDetailQuery SQL contains the same aggregate_status CASE expression', () => {
    const sql = buildStationDetailQuery({
      stationId: '33333333-3333-3333-3333-333333333333',
    });

    const sqlText = readSqlText(sql);

    expect(sqlText).toContain("WHEN 'AVAILABLE' THEN 0");
    expect(sqlText).toContain("WHEN 0 THEN 'AVAILABLE'");
    expect(sqlText).toContain("ELSE 'OFFLINE'");
  });
});

describe('B2 — Connector status cascade to station via SQL aggregate', () => {
  it('Aggregate status subquery references connector statuses from agg_c table', () => {
    const sql = buildNearbyStationsQuery({
      latitude: 40.18,
      limit: 50,
      longitude: 44.5,
      radiusMeters: 5000,
    });

    const sqlText = readSqlText(sql);

    expect(sqlText).toContain('agg_c."status"');
    expect(sqlText).toContain('agg_c."station_id" = s."id"');
    expect(sqlText).toContain('SELECT CASE MIN');
  });

  it('Aggregate status SQL maps AVAILABLE connector (priority 0) above OCCUPIED (priority 1)', () => {
    const sql = buildNearbyStationsQuery({
      latitude: 40.18,
      limit: 50,
      longitude: 44.5,
      radiusMeters: 5000,
    });

    const sqlText = readSqlText(sql);

    // AVAILABLE has priority 0 (lowest = best), OCCUPIED has priority 1
    expect(sqlText).toContain("WHEN 'AVAILABLE' THEN 0");
    expect(sqlText).toContain("WHEN 'OCCUPIED' THEN 1");
    expect(sqlText).toContain("WHEN 'MAINTENANCE' THEN 2");
    // ELSE 3 = OFFLINE
    expect(sqlText).toContain('ELSE 3');
  });

  it('Stations with no connectors default aggregate status to OFFLINE via ELSE clause', () => {
    const sql = buildNearbyStationsQuery({
      latitude: 40.18,
      limit: 50,
      longitude: 44.5,
      radiusMeters: 5000,
    });

    const sqlText = readSqlText(sql);

    // MIN of empty set is NULL → ELSE maps to OFFLINE
    expect(sqlText).toContain('ELSE 3');
    expect(sqlText).toContain("ELSE 'OFFLINE'");
  });
});

describe('B3 — Filter-aware detail query SQL', () => {
  it('buildStationDetailQuery with connectorTypes=[] adds no WHERE clause for type', () => {
    const sql = buildStationDetailQuery({
      connectorTypes: [],
      stationId: '33333333-3333-3333-3333-333333333333',
    });

    const sqlText = readSqlText(sql);

    expect(sqlText).not.toContain('c."connector_type"::text IN');
  });

  it('buildStationDetailQuery with connectorTypes=["CCS"] adds AND c.connector_type IN clause', () => {
    const sql = buildStationDetailQuery({
      connectorTypes: [ConnectorType.CCS],
      stationId: '33333333-3333-3333-3333-333333333333',
    });

    const sqlText = readSqlText(sql);
    const sqlValues = readSqlValues(sql);

    expect(sqlText).toContain('c."connector_type"::text IN');
    expect(sqlValues).toContain(ConnectorType.CCS);
  });

  it('buildStationDetailQuery with minimumPowerKw=50 adds AND c."power_kw" >= 50 clause', () => {
    const sql = buildStationDetailQuery({
      minimumPowerKw: 50,
      stationId: '33333333-3333-3333-3333-333333333333',
    });

    const sqlText = readSqlText(sql);
    const sqlValues = readSqlValues(sql);

    expect(sqlText).toContain('c."power_kw" >=');
    expect(sqlValues).toContain(50);
  });

  it('buildStationDetailQuery with both params adds both clauses', () => {
    const sql = buildStationDetailQuery({
      connectorTypes: [ConnectorType.CCS],
      minimumPowerKw: 50,
      stationId: '33333333-3333-3333-3333-333333333333',
    });

    const sqlText = readSqlText(sql);
    const sqlValues = readSqlValues(sql);

    expect(sqlText).toContain('c."connector_type"::text IN');
    expect(sqlText).toContain('c."power_kw" >=');
    expect(sqlValues).toContain(ConnectorType.CCS);
    expect(sqlValues).toContain(50);
  });

  it('buildStationDetailQuery with no filters omits connector filter WHERE clauses', () => {
    const sql = buildStationDetailQuery({
      stationId: '33333333-3333-3333-3333-333333333333',
    });

    const sqlText = readSqlText(sql);

    // Should not contain filter-specific patterns (IN clause or >= comparison)
    expect(sqlText).not.toContain('c."connector_type"::text IN');
    expect(sqlText).not.toContain('c."power_kw" >=');
  });
});
