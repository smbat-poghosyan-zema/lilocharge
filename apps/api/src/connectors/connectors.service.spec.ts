import type {
  ConnectorPricingCalculationRequest,
  ConnectorPricingCalculationResponse,
  StationConnectorResponse,
  UpdateConnectorStatusRequest,
} from '@lilocharge/shared-types';
import {
  computeAggregateStationStatus,
  ConnectorType,
  StationStatus,
} from '@lilocharge/shared-types';
import { NotFoundException } from '@nestjs/common';
import type {
  ConnectorType as PrismaConnectorType,
  StationStatus as PrismaStationStatus,
} from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import type { CacheService } from '../redis/cache.service';
import { ConnectorsService } from './connectors.service';

interface ConnectorRecord {
  readonly connectorType: PrismaConnectorType;
  readonly createdAt: Date;
  readonly evseId: string;
  readonly id: string;
  readonly lastStatusUpdate: Date;
  readonly powerKw: number;
  readonly stationId: string;
  readonly status: PrismaStationStatus;
  readonly updatedAt: Date;
}

interface PricingPlanRecord {
  readonly connectorId: string;
  readonly id: string;
  readonly idleFee: number | null;
  readonly name: string;
  readonly pricePerKwh: number | null;
  readonly pricePerMinute: number | null;
  readonly sessionFee: number | null;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}

interface PrismaConnectorDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
  readonly findMany: jest.Mock<Promise<readonly { status: string }[]>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<{ id: string; stationId: string } | null>, [unknown]>;
  readonly update: jest.Mock<Promise<ConnectorRecord>, [unknown]>;
}

interface PrismaPricingPlanDelegateMock {
  readonly findFirst: jest.Mock<Promise<PricingPlanRecord | null>, [unknown]>;
}

interface PrismaStationDelegateMock {
  readonly update: jest.Mock<Promise<unknown>, [unknown]>;
}

interface PrismaServiceMock {
  readonly connector: PrismaConnectorDelegateMock;
  readonly pricingPlan: PrismaPricingPlanDelegateMock;
  readonly station: PrismaStationDelegateMock;
}

interface CacheServiceMock {
  readonly cacheConnectorStatus: jest.Mock;
  readonly invalidateStation: jest.Mock;
}

const CONNECTOR_ID = '44444444-4444-4444-4444-444444444444';
const STATION_ID = '33333333-3333-3333-3333-333333333333';
const PRICING_PLAN_ID = '55555555-5555-5555-5555-555555555555';

/** Builds one connector record fixture with optional field overrides. */
function buildConnectorRecord(overrides?: Partial<ConnectorRecord>): ConnectorRecord {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    connectorType: 'CCS',
    createdAt: now,
    evseId: 'EVA-KEN-001',
    id: CONNECTOR_ID,
    lastStatusUpdate: now,
    powerKw: 120,
    stationId: STATION_ID,
    status: 'AVAILABLE',
    updatedAt: now,
    ...overrides,
  };
}

/** Builds one active pricing plan fixture with optional field overrides. */
function buildPricingPlanRecord(overrides?: Partial<PricingPlanRecord>): PricingPlanRecord {
  return {
    connectorId: CONNECTOR_ID,
    id: PRICING_PLAN_ID,
    idleFee: 30,
    name: 'EV Armenia Day Tariff',
    pricePerKwh: 145,
    pricePerMinute: 12,
    sessionFee: 500,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    ...overrides,
  };
}

describe('ConnectorsService', () => {
  let service: ConnectorsService;
  let prismaMock: PrismaServiceMock;
  let cacheMock: CacheServiceMock;

  beforeEach(() => {
    prismaMock = {
      connector: {
        findFirst: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
        findMany: jest
          .fn<Promise<readonly { status: string }[]>, [unknown]>()
          .mockResolvedValue([]),
        findUnique: jest.fn<Promise<{ id: string; stationId: string } | null>, [unknown]>(),
        update: jest.fn<Promise<ConnectorRecord>, [unknown]>(),
      },
      pricingPlan: {
        findFirst: jest.fn<Promise<PricingPlanRecord | null>, [unknown]>(),
      },
      station: {
        update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({}),
      },
    };

    cacheMock = {
      cacheConnectorStatus: jest.fn(),
      invalidateStation: jest.fn(),
    };

    service = new ConnectorsService(
      prismaMock as unknown as PrismaService,
      cacheMock as unknown as CacheService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates connector status and returns mapped connector response', async () => {
    const updatedTimestamp = new Date('2026-02-17T10:15:30.000Z');
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID, stationId: STATION_ID });
    prismaMock.connector.update.mockResolvedValue(
      buildConnectorRecord({
        lastStatusUpdate: updatedTimestamp,
        status: 'OCCUPIED',
      }),
    );

    const payload: UpdateConnectorStatusRequest = {
      lastStatusUpdate: updatedTimestamp.toISOString(),
      status: StationStatus.OCCUPIED,
    };

    const connector = await service.updateConnectorStatus(CONNECTOR_ID, payload);

    expect(connector).toEqual<StationConnectorResponse>({
      connectorType: ConnectorType.CCS,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-KEN-001',
      id: CONNECTOR_ID,
      lastStatusUpdate: '2026-02-17T10:15:30.000Z',
      powerKw: 120,
      stationId: STATION_ID,
      status: StationStatus.OCCUPIED,
      updatedAt: '2026-02-17T00:00:00.000Z',
    });
    expect(prismaMock.connector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastStatusUpdate: updatedTimestamp,
          status: 'OCCUPIED',
        },
        where: { id: CONNECTOR_ID },
      }),
    );
    expect(cacheMock.cacheConnectorStatus).toHaveBeenCalled();
    expect(cacheMock.invalidateStation).toHaveBeenCalledWith(STATION_ID);
  });

  it('uses current time as status timestamp when request timestamp is omitted', async () => {
    const now = new Date('2026-02-17T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID, stationId: STATION_ID });
    prismaMock.connector.update.mockResolvedValue(
      buildConnectorRecord({
        lastStatusUpdate: now,
      }),
    );

    await expect(
      service.updateConnectorStatus(CONNECTOR_ID, {
        status: StationStatus.AVAILABLE,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        lastStatusUpdate: now.toISOString(),
      }),
    );

    const [updateCall] = prismaMock.connector.update.mock.calls[0] ?? [];
    const updateData = (updateCall as { readonly data: { readonly lastStatusUpdate: Date } }).data;

    expect(updateData.lastStatusUpdate).toEqual(now);
  });

  it('throws not found when updating unknown connector status', async () => {
    prismaMock.connector.findUnique.mockResolvedValue(null);

    await expect(
      service.updateConnectorStatus(CONNECTOR_ID, {
        status: StationStatus.OFFLINE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.connector.update).not.toHaveBeenCalled();
  });

  it('updates connector status from OCPP charge point and connector identifiers', async () => {
    const updatedTimestamp = new Date('2026-02-17T14:30:00.000Z');
    prismaMock.connector.findFirst.mockResolvedValue({ id: CONNECTOR_ID });
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID, stationId: STATION_ID });
    prismaMock.connector.update.mockResolvedValue(
      buildConnectorRecord({
        lastStatusUpdate: updatedTimestamp,
        status: 'MAINTENANCE',
      }),
    );

    const connector = await service.updateConnectorStatusFromOcppNotification('ev-armenia-001', 2, {
      lastStatusUpdate: updatedTimestamp.toISOString(),
      status: StationStatus.MAINTENANCE,
    });

    expect(connector.id).toBe(CONNECTOR_ID);
    expect(connector.status).toBe(StationStatus.MAINTENANCE);
    expect(prismaMock.connector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          station: {
            operatorId: 'ev-armenia-001',
          },
          OR: [
            { evseId: 'ev-armenia-001-evse-2' },
            { evseId: 'ev-armenia-001-2' },
            { evseId: '2' },
          ],
        },
      }),
    );
  });

  it('throws not found when OCPP connector lookup cannot resolve a connector record', async () => {
    prismaMock.connector.findFirst.mockResolvedValue(null);

    await expect(
      service.updateConnectorStatusFromOcppNotification('ev-armenia-001', 2, {
        status: StationStatus.AVAILABLE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.connector.update).not.toHaveBeenCalled();
  });

  it('calculates connector pricing from active tariff plan components', async () => {
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID, stationId: STATION_ID });
    prismaMock.pricingPlan.findFirst.mockResolvedValue(buildPricingPlanRecord());

    const payload: ConnectorPricingCalculationRequest = {
      calculateAt: '2026-02-17T11:00:00.000Z',
      chargingDurationMinutes: 47.5,
      energyKwh: 18.4,
      idleDurationMinutes: 3.2,
    };

    const estimate = await service.calculatePricing(CONNECTOR_ID, payload);

    expect(estimate).toEqual<ConnectorPricingCalculationResponse>({
      calculateAt: '2026-02-17T11:00:00.000Z',
      chargingDurationMinutes: 47.5,
      chargingTimeCost: 570,
      connectorId: CONNECTOR_ID,
      currencyCode: 'AMD',
      energyCost: 2668,
      energyKwh: 18.4,
      idleCost: 96,
      idleDurationMinutes: 3.2,
      idleFee: 30,
      pricePerKwh: 145,
      pricePerMinute: 12,
      pricingPlanId: PRICING_PLAN_ID,
      pricingPlanName: 'EV Armenia Day Tariff',
      sessionFee: 500,
      sessionFeeCost: 500,
      totalCost: 3834,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
    });

    const [findFirstCall] = prismaMock.pricingPlan.findFirst.mock.calls[0] ?? [];
    const where = (
      findFirstCall as {
        readonly where: {
          readonly connectorId: string;
          readonly validFrom: {
            readonly lte: Date;
          };
        };
      }
    ).where;

    expect(where.connectorId).toBe(CONNECTOR_ID);
    expect(where.validFrom.lte).toEqual(new Date('2026-02-17T11:00:00.000Z'));
  });

  it('returns zero-priced components when pricing plan rates are null', async () => {
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID, stationId: STATION_ID });
    prismaMock.pricingPlan.findFirst.mockResolvedValue(
      buildPricingPlanRecord({
        idleFee: null,
        pricePerKwh: null,
        pricePerMinute: null,
        sessionFee: null,
      }),
    );

    const estimate = await service.calculatePricing(CONNECTOR_ID, {
      chargingDurationMinutes: 10,
      energyKwh: 2.5,
    });

    expect(estimate.energyCost).toBe(0);
    expect(estimate.chargingTimeCost).toBe(0);
    expect(estimate.idleCost).toBe(0);
    expect(estimate.sessionFeeCost).toBe(0);
    expect(estimate.idleDurationMinutes).toBe(0);
    expect(estimate.totalCost).toBe(0);
  });

  it('throws not found when connector does not exist for pricing calculation', async () => {
    prismaMock.connector.findUnique.mockResolvedValue(null);

    await expect(
      service.calculatePricing(CONNECTOR_ID, {
        chargingDurationMinutes: 20,
        energyKwh: 6,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws not found when no active pricing plan exists for connector', async () => {
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID, stationId: STATION_ID });
    prismaMock.pricingPlan.findFirst.mockResolvedValue(null);

    await expect(
      service.calculatePricing(CONNECTOR_ID, {
        chargingDurationMinutes: 20,
        energyKwh: 6,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('B2 — Connector status cascade to station aggregate status', () => {
  it('Given AVAILABLE connector alongside OCCUPIED connectors, Then aggregate station status is AVAILABLE', () => {
    const connectorStatuses = [
      StationStatus.AVAILABLE,
      StationStatus.OCCUPIED,
      StationStatus.OCCUPIED,
    ];

    expect(computeAggregateStationStatus(connectorStatuses)).toBe(StationStatus.AVAILABLE);
  });

  it('Given only OCCUPIED connectors (no AVAILABLE), Then aggregate station status is OCCUPIED', () => {
    const connectorStatuses = [StationStatus.OCCUPIED, StationStatus.OCCUPIED];

    expect(computeAggregateStationStatus(connectorStatuses)).toBe(StationStatus.OCCUPIED);
  });

  it('Given all connectors OFFLINE, Then aggregate station status is OFFLINE', () => {
    const connectorStatuses = [StationStatus.OFFLINE, StationStatus.OFFLINE];

    expect(computeAggregateStationStatus(connectorStatuses)).toBe(StationStatus.OFFLINE);
  });

  it('Given empty connector array (no connectors), Then station status is OFFLINE', () => {
    expect(computeAggregateStationStatus([])).toBe(StationStatus.OFFLINE);
  });

  it('Given MAINTENANCE connectors alongside OFFLINE, Then aggregate status is MAINTENANCE', () => {
    const connectorStatuses = [StationStatus.MAINTENANCE, StationStatus.OFFLINE];

    expect(computeAggregateStationStatus(connectorStatuses)).toBe(StationStatus.MAINTENANCE);
  });

  it('Given one AVAILABLE alongside OFFLINE and MAINTENANCE, Then aggregate status is AVAILABLE', () => {
    const connectorStatuses = [
      StationStatus.OFFLINE,
      StationStatus.MAINTENANCE,
      StationStatus.AVAILABLE,
    ];

    expect(computeAggregateStationStatus(connectorStatuses)).toBe(StationStatus.AVAILABLE);
  });
});
