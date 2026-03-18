import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

/** Normalized connector payload accepted by station import upsert logic. */
export interface ImportedStationConnector {
  readonly evseId: string;
  readonly connectorType: ConnectorType;
  readonly powerKw: number;
  readonly status: StationStatus;
}

/** Normalized station payload accepted by station import upsert logic. */
export interface ImportedStationRecord {
  readonly externalId: string;
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
  readonly connectors: readonly ImportedStationConnector[];
}

/** Summary statistics returned by station import operations. */
export interface StationImportSummary {
  readonly stationsProcessed: number;
  readonly stationsUpserted: number;
  readonly connectorsUpserted: number;
}
