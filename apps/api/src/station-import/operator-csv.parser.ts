import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import type { ImportedStationConnector, ImportedStationRecord } from './station-import.types';

const REQUIRED_COLUMNS: readonly string[] = [
  'external_id',
  'operator_id',
  'operator_name',
  'name',
  'address',
  'city',
  'latitude',
  'longitude',
  'evse_id',
  'connector_type',
  'power_kw',
];

interface StationDraft {
  readonly address: string;
  readonly amenities: readonly string[];
  readonly city: string;
  readonly externalId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly status: StationStatus;
  readonly connectorsByEvseId: Map<string, ImportedStationConnector>;
}

/** Parses CSV content from Armenian operator exports into normalized station records. */
export function parseOperatorStationsCsv(csvContent: string): ImportedStationRecord[] {
  const rows = parseCsvRows(csvContent);
  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0];
  const headerMap = buildHeaderMap(headerRow);
  assertRequiredColumns(headerMap);

  const stationsByKey = new Map<string, StationDraft>();

  for (let index = 1; index < rows.length; index += 1) {
    const line = rows[index];
    if (line === undefined || isEmptyCsvRow(line)) {
      continue;
    }

    const sourceLineNumber = index + 1;
    const station = parseStationDraftRow(line, sourceLineNumber, headerMap);
    const key = `${station.operatorId}:${station.externalId}`;

    const existingStation = stationsByKey.get(key);
    if (existingStation === undefined) {
      stationsByKey.set(key, station);
      continue;
    }

    station.connectorsByEvseId.forEach((connector, evseId) => {
      existingStation.connectorsByEvseId.set(evseId, connector);
    });
  }

  return [...stationsByKey.values()].map((station) => {
    return {
      address: station.address,
      amenities: station.amenities,
      city: station.city,
      connectors: [...station.connectorsByEvseId.values()],
      externalId: station.externalId,
      latitude: station.latitude,
      longitude: station.longitude,
      name: station.name,
      openingHours: station.openingHours,
      operatorId: station.operatorId,
      operatorName: station.operatorName,
      status: station.status,
    };
  });
}

/** Parses one station row and returns a station draft grouped by operator and external id. */
function parseStationDraftRow(
  row: readonly string[],
  lineNumber: number,
  headerMap: ReadonlyMap<string, number>,
): StationDraft {
  const externalId = readRequiredValue(row, headerMap, 'external_id', lineNumber);
  const operatorId = readRequiredValue(row, headerMap, 'operator_id', lineNumber);
  const operatorName = readRequiredValue(row, headerMap, 'operator_name', lineNumber);
  const name = readRequiredValue(row, headerMap, 'name', lineNumber);
  const address = readRequiredValue(row, headerMap, 'address', lineNumber);
  const city = readRequiredValue(row, headerMap, 'city', lineNumber);
  const latitude = readRequiredNumber(row, headerMap, 'latitude', lineNumber);
  const longitude = readRequiredNumber(row, headerMap, 'longitude', lineNumber);
  const stationStatus = parseOptionalStationStatus(readOptionalValue(row, headerMap, 'status'));
  const openingHours = readOptionalValue(row, headerMap, 'opening_hours') ?? null;
  const amenities = parseAmenities(readOptionalValue(row, headerMap, 'amenities'));
  const connector = parseConnectorFromRow(row, headerMap, lineNumber);

  return {
    address,
    amenities,
    city,
    connectorsByEvseId: new Map<string, ImportedStationConnector>([[connector.evseId, connector]]),
    externalId,
    latitude,
    longitude,
    name,
    openingHours,
    operatorId,
    operatorName,
    status: stationStatus,
  };
}

/** Parses one connector from a CSV row. */
function parseConnectorFromRow(
  row: readonly string[],
  headerMap: ReadonlyMap<string, number>,
  lineNumber: number,
): ImportedStationConnector {
  const evseId = readRequiredValue(row, headerMap, 'evse_id', lineNumber);
  const connectorTypeText = readRequiredValue(row, headerMap, 'connector_type', lineNumber);
  const powerKw = readRequiredNumber(row, headerMap, 'power_kw', lineNumber);
  const connectorStatus = parseOptionalStationStatus(
    readOptionalValue(row, headerMap, 'connector_status'),
  );

  return {
    connectorType: parseConnectorType(connectorTypeText),
    evseId,
    powerKw,
    status: connectorStatus,
  };
}

/** Parses station amenities encoded as a pipe-delimited string. */
function parseAmenities(rawAmenities: string | undefined): readonly string[] {
  if (rawAmenities === undefined) {
    return [];
  }

  return rawAmenities
    .split('|')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Maps CSV connector type values to shared connector enums. */
function parseConnectorType(rawConnectorType: string): ConnectorType {
  const normalized = rawConnectorType.trim().toUpperCase();

  switch (normalized) {
    case 'TYPE_1':
    case 'TYPE 1':
      return ConnectorType.TYPE_1;
    case 'TYPE_2':
    case 'TYPE 2':
      return ConnectorType.TYPE_2;
    case 'CHADEMO':
      return ConnectorType.CHADEMO;
    case 'TESLA':
      return ConnectorType.TESLA;
    case 'GBT':
    case 'GB/T':
      return ConnectorType.GBT;
    case 'CCS':
    case 'CCS2':
    case 'CCS_COMBO':
      return ConnectorType.CCS;
    default:
      return ConnectorType.CCS;
  }
}

/** Maps optional CSV status text into shared station status enums with AVAILABLE default. */
function parseOptionalStationStatus(rawStatus: string | undefined): StationStatus {
  if (rawStatus === undefined) {
    return StationStatus.AVAILABLE;
  }

  const normalized = rawStatus.trim().toUpperCase();

  switch (normalized) {
    case 'OCCUPIED':
      return StationStatus.OCCUPIED;
    case 'OFFLINE':
      return StationStatus.OFFLINE;
    case 'MAINTENANCE':
      return StationStatus.MAINTENANCE;
    case 'AVAILABLE':
    default:
      return StationStatus.AVAILABLE;
  }
}

/** Parses CSV text into rows and fields with quote escaping support. */
function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csvContent.length; index += 1) {
    const character = csvContent[index];

    if (character === '"') {
      if (inQuotes && csvContent[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];

      if (character === '\r' && csvContent[index + 1] === '\n') {
        index += 1;
      }

      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Builds a normalized header lookup map from column names to indices. */
function buildHeaderMap(headerRow: readonly string[]): ReadonlyMap<string, number> {
  const headerEntries = headerRow.map((column, index) => {
    return [normalizeHeaderName(column), index] as const;
  });

  return new Map<string, number>(headerEntries);
}

/** Ensures required CSV columns are present before parsing rows. */
function assertRequiredColumns(headerMap: ReadonlyMap<string, number>): void {
  const missingColumns = REQUIRED_COLUMNS.filter((columnName) => !headerMap.has(columnName));

  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingColumns.join(', ')}`);
  }
}

/** Reads a required field from a CSV row and fails with line-level context when missing. */
function readRequiredValue(
  row: readonly string[],
  headerMap: ReadonlyMap<string, number>,
  columnName: string,
  lineNumber: number,
): string {
  const value = readOptionalValue(row, headerMap, columnName);

  if (value === undefined) {
    throw new Error(`Missing ${columnName} at line ${lineNumber}`);
  }

  return value;
}

/** Reads an optional field from a CSV row and trims whitespace. */
function readOptionalValue(
  row: readonly string[],
  headerMap: ReadonlyMap<string, number>,
  columnName: string,
): string | undefined {
  const columnIndex = headerMap.get(columnName);
  if (columnIndex === undefined) {
    return undefined;
  }

  const rawValue = row[columnIndex];
  if (rawValue === undefined) {
    return undefined;
  }

  const trimmedValue = rawValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

/** Reads a required numeric field from a CSV row and validates finiteness. */
function readRequiredNumber(
  row: readonly string[],
  headerMap: ReadonlyMap<string, number>,
  columnName: string,
  lineNumber: number,
): number {
  const value = readRequiredValue(row, headerMap, columnName, lineNumber);
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid ${columnName} at line ${lineNumber}`);
  }

  return numericValue;
}

/** Returns true when every field in a parsed CSV row is empty after trimming. */
function isEmptyCsvRow(row: readonly string[]): boolean {
  return row.every((field) => field.trim().length === 0);
}

/** Normalizes CSV header names for case-insensitive lookups. */
function normalizeHeaderName(rawHeader: string): string {
  return rawHeader.trim().toLowerCase();
}
