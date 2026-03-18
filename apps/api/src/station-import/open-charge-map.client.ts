import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import type { ImportedStationConnector, ImportedStationRecord } from './station-import.types';

const DEFAULT_BASE_URL = 'https://api.openchargemap.io/v3/poi/';
const DEFAULT_MAX_RESULTS = 1000;
const ARMENIA_COUNTRY_CODE = 'AM';

interface OpenChargeMapClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly maxResults?: number;
}

/** Client for retrieving Armenian station data from the Open Charge Map API. */
export class OpenChargeMapClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxResults: number;

  constructor(options: OpenChargeMapClientOptions = {}) {
    this.apiKey = normalizeOptionalString(options.apiKey);
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
    this.maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  }

  /** Fetches and maps all Armenian Open Charge Map POIs into normalized station records. */
  public async fetchArmenianStations(): Promise<ImportedStationRecord[]> {
    const requestUrl = buildOpenChargeMapRequestUrl({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      countryCode: ARMENIA_COUNTRY_CODE,
      maxResults: this.maxResults,
    });

    const response = await this.fetchFn(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Open Charge Map request failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Open Charge Map response is not an array');
    }

    return payload.flatMap((poi) => {
      const mappedStation = mapOpenChargeMapPoiToStation(poi);
      return mappedStation === null ? [] : [mappedStation];
    });
  }
}

interface BuildOpenChargeMapRequestUrlInput {
  readonly baseUrl: string;
  readonly countryCode: string;
  readonly maxResults: number;
  readonly apiKey?: string;
}

/** Builds the Open Charge Map request URL used for Armenian POI import. */
function buildOpenChargeMapRequestUrl(input: BuildOpenChargeMapRequestUrlInput): string {
  const requestUrl = new URL(input.baseUrl);
  requestUrl.searchParams.set('output', 'json');
  requestUrl.searchParams.set('countrycode', input.countryCode);
  requestUrl.searchParams.set('maxresults', String(input.maxResults));
  requestUrl.searchParams.set('compact', 'true');
  requestUrl.searchParams.set('verbose', 'false');

  if (input.apiKey !== undefined) {
    requestUrl.searchParams.set('key', input.apiKey);
  }

  return requestUrl.toString();
}

/** Maps one raw Open Charge Map POI object into a normalized import station record. */
function mapOpenChargeMapPoiToStation(rawPoi: unknown): ImportedStationRecord | null {
  if (!isRecord(rawPoi)) {
    return null;
  }

  const stationId = normalizeOptionalString(readStringOrNumber(rawPoi, 'ID'));
  const addressInfo = readRecord(rawPoi, 'AddressInfo');

  if (stationId === undefined || addressInfo === null) {
    return null;
  }

  const latitude = readFiniteNumber(addressInfo, 'Latitude');
  const longitude = readFiniteNumber(addressInfo, 'Longitude');
  if (latitude === null || longitude === null) {
    return null;
  }

  const name =
    normalizeOptionalString(readString(addressInfo, 'Title')) ??
    normalizeOptionalString(readString(addressInfo, 'AddressLine1'));
  const address =
    normalizeOptionalString(readString(addressInfo, 'AddressLine1')) ??
    normalizeOptionalString(readString(addressInfo, 'Title'));

  if (name === undefined || address === undefined) {
    return null;
  }

  const city = normalizeOptionalString(readString(addressInfo, 'Town')) ?? 'Unknown';
  const operatorInfo = readRecord(rawPoi, 'OperatorInfo');
  const operatorId =
    normalizeOptionalString(readStringOrNumber(operatorInfo, 'ID')) !== undefined
      ? `ocm-${normalizeOptionalString(readStringOrNumber(operatorInfo, 'ID'))}`
      : 'ocm-unknown';
  const operatorName =
    normalizeOptionalString(readString(operatorInfo, 'Title')) ?? 'Open Charge Map';
  const stationStatus = mapOperationalStatusToStationStatus(readRecord(rawPoi, 'StatusType'));
  const openingHours = normalizeOptionalString(readString(addressInfo, 'AccessComments')) ?? null;
  const connectionsRaw = readArray(rawPoi, 'Connections');
  const connectors = connectionsRaw.flatMap((connection, index) => {
    const mappedConnector = mapOpenChargeMapConnection(connection, stationId, index);
    return mappedConnector === null ? [] : [mappedConnector];
  });

  return {
    address,
    amenities: [],
    city,
    connectors,
    externalId: stationId,
    latitude,
    longitude,
    name,
    openingHours,
    operatorId,
    operatorName,
    status: stationStatus,
  };
}

/** Maps one Open Charge Map connection object into a normalized imported connector payload. */
function mapOpenChargeMapConnection(
  rawConnection: unknown,
  stationExternalId: string,
  index: number,
): ImportedStationConnector | null {
  if (!isRecord(rawConnection)) {
    return null;
  }

  const connectionId =
    normalizeOptionalString(readStringOrNumber(rawConnection, 'ID')) ?? String(index + 1);
  const connectionType = readRecord(rawConnection, 'ConnectionType');
  const connectionTypeTitle = normalizeOptionalString(readString(connectionType, 'Title')) ?? 'CCS';
  const powerKw = readFiniteNumber(rawConnection, 'PowerKW') ?? 0;
  const status = mapOperationalStatusToStationStatus(readRecord(rawConnection, 'StatusType'));

  return {
    connectorType: mapConnectionTypeToConnectorType(connectionTypeTitle),
    evseId: `ocm-${stationExternalId}-${connectionId}`,
    powerKw,
    status,
  };
}

/** Maps Open Charge Map text labels to shared connector type enums. */
function mapConnectionTypeToConnectorType(rawType: string): ConnectorType {
  const normalizedType = rawType.toUpperCase();

  if (normalizedType.includes('CCS') || normalizedType.includes('COMBO')) {
    return ConnectorType.CCS;
  }
  if (normalizedType.includes('CHADEMO')) {
    return ConnectorType.CHADEMO;
  }
  if (normalizedType.includes('TESLA')) {
    return ConnectorType.TESLA;
  }
  if (normalizedType.includes('GB/T') || normalizedType.includes('GBT')) {
    return ConnectorType.GBT;
  }
  if (
    normalizedType.includes('TYPE 1') ||
    normalizedType.includes('TYPE-1') ||
    normalizedType.includes('J1772')
  ) {
    return ConnectorType.TYPE_1;
  }
  if (
    normalizedType.includes('TYPE 2') ||
    normalizedType.includes('TYPE-2') ||
    normalizedType.includes('MENNEKES')
  ) {
    return ConnectorType.TYPE_2;
  }

  return ConnectorType.CCS;
}

/** Maps Open Charge Map operational flags into shared station status values. */
function mapOperationalStatusToStationStatus(
  rawStatus: Record<string, unknown> | null,
): StationStatus {
  const operationalFlag = rawStatus?.IsOperational;

  if (typeof operationalFlag === 'boolean') {
    return operationalFlag ? StationStatus.AVAILABLE : StationStatus.OFFLINE;
  }

  return StationStatus.AVAILABLE;
}

/** Reads a property as an object map from a possibly null/unknown parent record. */
function readRecord(
  parent: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | null {
  if (parent === null || parent === undefined) {
    return null;
  }

  const value = parent[key];
  return isRecord(value) ? value : null;
}

/** Reads a property as a readonly unknown array from a parent record. */
function readArray(parent: Record<string, unknown>, key: string): readonly unknown[] {
  const value = parent[key];
  return Array.isArray(value) ? value : [];
}

/** Reads a string value from a nullable/unknown record property. */
function readString(parent: Record<string, unknown> | null, key: string): string | undefined {
  if (parent === null) {
    return undefined;
  }

  const value = parent[key];
  return typeof value === 'string' ? value : undefined;
}

/** Reads a property that may be encoded as either string or number. */
function readStringOrNumber(
  parent: Record<string, unknown> | null,
  key: string,
): string | number | undefined {
  if (parent === null) {
    return undefined;
  }

  const value = parent[key];
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  return undefined;
}

/** Reads a finite number property from a nullable/unknown record. */
function readFiniteNumber(parent: Record<string, unknown> | null, key: string): number | null {
  if (parent === null) {
    return null;
  }

  const value = parent[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

/** Normalizes optional string values by trimming and removing empties. */
function normalizeOptionalString(value: string | number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

/** Type guard ensuring unknown values are plain key/value records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
