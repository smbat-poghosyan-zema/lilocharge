import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import type {
  ConnectorType as PrismaConnectorType,
  StationStatus as PrismaStationStatus,
} from '@prisma/client';

import { StationImportService, buildDeterministicImportId } from './station-import.service';
import type { ImportedStationRecord } from './station-import.types';

interface PrismaStationDelegateMock {
  readonly upsert: jest.Mock<Promise<void>, [unknown]>;
}

interface PrismaConnectorDelegateMock {
  readonly upsert: jest.Mock<Promise<void>, [unknown]>;
}

interface PrismaServiceMock {
  readonly station: PrismaStationDelegateMock;
  readonly connector: PrismaConnectorDelegateMock;
}

/** Builds a normalized imported station fixture used in service tests. */
function buildImportedStation(overrides?: Partial<ImportedStationRecord>): ImportedStationRecord {
  return {
    address: 'Հյուսիսային պողոտա 10',
    amenities: ['parking', 'cafe'],
    city: 'Yerevan',
    connectors: [
      {
        connectorType: ConnectorType.CCS,
        evseId: 'EVA-KEN-001',
        powerKw: 120,
        status: StationStatus.AVAILABLE,
      },
      {
        connectorType: ConnectorType.TYPE_2,
        evseId: 'EVA-KEN-002',
        powerKw: 22,
        status: StationStatus.OFFLINE,
      },
    ],
    externalId: 'st-001',
    latitude: 40.1792,
    longitude: 44.4991,
    name: 'Kentron Hub',
    openingHours: '24/7',
    operatorId: 'ev_armenia',
    operatorName: 'EV Armenia',
    status: StationStatus.AVAILABLE,
    ...overrides,
  };
}

describe('StationImportService', () => {
  let service: StationImportService;
  let prismaMock: PrismaServiceMock;

  beforeEach(() => {
    prismaMock = {
      station: {
        upsert: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
      },
      connector: {
        upsert: jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined),
      },
    };

    service = new StationImportService(prismaMock);
  });

  it('upserts stations and connectors and returns summary counts', async () => {
    const result = await service.importStations([buildImportedStation()]);

    expect(result).toEqual({
      connectorsUpserted: 2,
      stationsProcessed: 1,
      stationsUpserted: 1,
    });
    expect(prismaMock.station.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.connector.upsert).toHaveBeenCalledTimes(2);

    const stationCall = prismaMock.station.upsert.mock.calls[0]?.[0] as {
      readonly where: { readonly id: string };
      readonly create: { readonly status: PrismaStationStatus };
    };

    expect(stationCall.where.id).toBe(buildDeterministicImportId('ev_armenia:st-001'));
    expect(stationCall.create.status).toBe('AVAILABLE' satisfies PrismaStationStatus);

    const connectorCall = prismaMock.connector.upsert.mock.calls[0]?.[0] as {
      readonly create: { readonly connectorType: PrismaConnectorType };
      readonly where: { readonly stationId_evseId: { readonly evseId: string } };
    };

    expect(connectorCall.create.connectorType).toBe('CCS' satisfies PrismaConnectorType);
    expect(connectorCall.where.stationId_evseId.evseId).toBe('EVA-KEN-001');
  });

  it('produces stable deterministic ids for repeated imports', () => {
    const first = buildDeterministicImportId('ocm:101');
    const second = buildDeterministicImportId('ocm:101');
    const different = buildDeterministicImportId('ocm:102');

    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });
});
