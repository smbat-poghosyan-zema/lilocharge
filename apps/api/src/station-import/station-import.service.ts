import { createHash } from 'node:crypto';

import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import {
  ConnectorType as PrismaConnectorType,
  Prisma,
  StationStatus as PrismaStationStatus,
} from '@prisma/client';

import type {
  ImportedStationConnector,
  ImportedStationRecord,
  StationImportSummary,
} from './station-import.types';

interface StationImportPrismaClient {
  readonly station: {
    upsert(args: Prisma.StationUpsertArgs): Promise<unknown>;
  };
  readonly connector: {
    upsert(args: Prisma.ConnectorUpsertArgs): Promise<unknown>;
  };
}

/** Service that upserts normalized station import records into Prisma entities. */
export class StationImportService {
  constructor(private readonly prismaService: StationImportPrismaClient) {}

  /** Imports station records and returns summary counters for upserted entities. */
  public async importStations(
    stations: readonly ImportedStationRecord[],
  ): Promise<StationImportSummary> {
    let connectorsUpserted = 0;

    for (const station of stations) {
      const stationId = buildDeterministicImportId(`${station.operatorId}:${station.externalId}`);
      const stationUpsertInput = buildStationUpsertArgs(station, stationId);

      await this.prismaService.station.upsert(stationUpsertInput);

      for (const connector of station.connectors) {
        const connectorUpsertInput = buildConnectorUpsertArgs(connector, stationId);
        await this.prismaService.connector.upsert(connectorUpsertInput);
        connectorsUpserted += 1;
      }
    }

    return {
      connectorsUpserted,
      stationsProcessed: stations.length,
      stationsUpserted: stations.length,
    };
  }
}

/** Builds Prisma station upsert arguments from a normalized imported station payload. */
function buildStationUpsertArgs(
  station: ImportedStationRecord,
  stationId: string,
): Prisma.StationUpsertArgs {
  const stationData = {
    address: station.address,
    amenities: [...station.amenities],
    city: station.city,
    latitude: station.latitude,
    longitude: station.longitude,
    name: station.name,
    openingHours: station.openingHours,
    operatorId: station.operatorId,
    operatorName: station.operatorName,
    status: mapSharedStationStatusToPrisma(station.status),
  };

  return {
    where: {
      id: stationId,
    },
    update: stationData,
    create: {
      ...stationData,
      id: stationId,
    },
  };
}

/** Builds Prisma connector upsert arguments from a normalized imported connector payload. */
function buildConnectorUpsertArgs(
  connector: ImportedStationConnector,
  stationId: string,
): Prisma.ConnectorUpsertArgs {
  const connectorData = {
    connectorType: mapSharedConnectorTypeToPrisma(connector.connectorType),
    powerKw: connector.powerKw,
    status: mapSharedStationStatusToPrisma(connector.status),
    lastStatusUpdate: new Date(),
  };

  return {
    where: {
      stationId_evseId: {
        evseId: connector.evseId,
        stationId,
      },
    },
    update: connectorData,
    create: {
      ...connectorData,
      evseId: connector.evseId,
      stationId,
    },
  };
}

/** Maps shared station statuses to Prisma station statuses. */
function mapSharedStationStatusToPrisma(status: StationStatus): PrismaStationStatus {
  switch (status) {
    case StationStatus.OCCUPIED:
      return PrismaStationStatus.OCCUPIED;
    case StationStatus.OFFLINE:
      return PrismaStationStatus.OFFLINE;
    case StationStatus.MAINTENANCE:
      return PrismaStationStatus.MAINTENANCE;
    case StationStatus.AVAILABLE:
    default:
      return PrismaStationStatus.AVAILABLE;
  }
}

/** Maps shared connector types to Prisma connector type enums. */
function mapSharedConnectorTypeToPrisma(connectorType: ConnectorType): PrismaConnectorType {
  switch (connectorType) {
    case ConnectorType.TYPE_1:
      return PrismaConnectorType.TYPE_1;
    case ConnectorType.TYPE_2:
      return PrismaConnectorType.TYPE_2;
    case ConnectorType.CHADEMO:
      return PrismaConnectorType.CHADEMO;
    case ConnectorType.TESLA:
      return PrismaConnectorType.TESLA;
    case ConnectorType.GBT:
      return PrismaConnectorType.GBT;
    case ConnectorType.CCS:
    default:
      return PrismaConnectorType.CCS;
  }
}

/** Generates a deterministic UUID-like id from stable import source keys. */
export function buildDeterministicImportId(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');

  const segment1 = hash.slice(0, 8);
  const segment2 = hash.slice(8, 12);
  const segment3 = `5${hash.slice(13, 16)}`;
  const variantValue = ((Number.parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  const segment4 = `${variantValue}${hash.slice(17, 20)}`;
  const segment5 = hash.slice(20, 32);

  return `${segment1}-${segment2}-${segment3}-${segment4}-${segment5}`;
}
