import type { ConnectorPricingCalculationResponse } from '@lilocharge/shared-types';

import type { ConnectorsService } from '../connectors/connectors.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionCostCalculatorService } from './session-cost-calculator.service';

interface MeterValueActivityRecord {
  readonly timestamp: Date;
  readonly energyActiveImport: number;
  readonly powerActiveImport: number;
}

interface PrismaMeterValueDelegateMock {
  readonly findMany: jest.Mock<Promise<MeterValueActivityRecord[]>, [unknown]>;
}

interface PrismaServiceMock {
  readonly meterValue: PrismaMeterValueDelegateMock;
}

interface ConnectorsServiceMock extends Pick<ConnectorsService, 'calculatePricing'> {
  readonly calculatePricing: jest.Mock<
    ReturnType<ConnectorsService['calculatePricing']>,
    Parameters<ConnectorsService['calculatePricing']>
  >;
}

const CONNECTOR_ID = '33333333-3333-3333-3333-333333333333';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';

/** Builds one connector pricing response fixture with optional overrides. */
function buildPricingResponse(
  overrides?: Partial<ConnectorPricingCalculationResponse>,
): ConnectorPricingCalculationResponse {
  return {
    calculateAt: '2026-02-17T12:40:00.000Z',
    chargingDurationMinutes: 30,
    chargingTimeCost: 360,
    connectorId: CONNECTOR_ID,
    currencyCode: 'AMD',
    energyCost: 980,
    energyKwh: 7,
    idleCost: 300,
    idleDurationMinutes: 10,
    idleFee: 30,
    pricePerKwh: 140,
    pricePerMinute: 12,
    pricingPlanId: 'pricing-plan-1',
    pricingPlanName: 'Default DC',
    sessionFee: 500,
    sessionFeeCost: 500,
    totalCost: 2140,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    ...overrides,
  };
}

describe('SessionCostCalculatorService', () => {
  let connectorsServiceMock: ConnectorsServiceMock;
  let prismaMock: PrismaServiceMock;
  let service: SessionCostCalculatorService;

  beforeEach(() => {
    prismaMock = {
      meterValue: {
        findMany: jest.fn<Promise<MeterValueActivityRecord[]>, [unknown]>(),
      },
    };

    connectorsServiceMock = {
      calculatePricing: jest.fn<
        ReturnType<ConnectorsService['calculatePricing']>,
        Parameters<ConnectorsService['calculatePricing']>
      >(),
    };

    service = new SessionCostCalculatorService(
      prismaMock as unknown as PrismaService,
      connectorsServiceMock as unknown as ConnectorsService,
    );
  });

  it('calculates session cost with idle duration detected after charging activity stops', async () => {
    prismaMock.meterValue.findMany.mockResolvedValue([
      {
        energyActiveImport: 10_000,
        powerActiveImport: 7000,
        timestamp: new Date('2026-02-17T12:00:00.000Z'),
      },
      {
        energyActiveImport: 13_000,
        powerActiveImport: 6500,
        timestamp: new Date('2026-02-17T12:30:00.000Z'),
      },
      {
        energyActiveImport: 13_000,
        powerActiveImport: 0,
        timestamp: new Date('2026-02-17T12:40:00.000Z'),
      },
    ]);
    connectorsServiceMock.calculatePricing.mockResolvedValue(
      buildPricingResponse({
        chargingDurationMinutes: 30,
        idleDurationMinutes: 10,
        totalCost: 2140,
      }),
    );

    const result = await service.calculateSessionCost({
      connectorId: CONNECTOR_ID,
      energyDeliveredKwh: 7,
      sessionId: SESSION_ID,
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:40:00.000Z'),
    });

    expect(result).toEqual({
      chargingDurationMinutes: 30,
      idleDurationMinutes: 10,
      totalCost: 2140,
    });
    expect(connectorsServiceMock.calculatePricing).toHaveBeenCalledWith(CONNECTOR_ID, {
      calculateAt: '2026-02-17T12:40:00.000Z',
      chargingDurationMinutes: 30,
      energyKwh: 7,
      idleDurationMinutes: 10,
    });
  });

  it('uses full session duration as charging time when charging remains active until stop', async () => {
    prismaMock.meterValue.findMany.mockResolvedValue([
      {
        energyActiveImport: 10_000,
        powerActiveImport: 7200,
        timestamp: new Date('2026-02-17T12:00:00.000Z'),
      },
      {
        energyActiveImport: 14_800,
        powerActiveImport: 7000,
        timestamp: new Date('2026-02-17T12:40:00.000Z'),
      },
    ]);
    connectorsServiceMock.calculatePricing.mockResolvedValue(
      buildPricingResponse({
        chargingDurationMinutes: 40,
        idleDurationMinutes: 0,
        totalCost: 1980,
      }),
    );

    const result = await service.calculateSessionCost({
      connectorId: CONNECTOR_ID,
      energyDeliveredKwh: 4.8,
      sessionId: SESSION_ID,
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:40:00.000Z'),
    });

    expect(result).toEqual({
      chargingDurationMinutes: 40,
      idleDurationMinutes: 0,
      totalCost: 1980,
    });
  });

  it('treats full session duration as idle when no charging activity is detected', async () => {
    prismaMock.meterValue.findMany.mockResolvedValue([
      {
        energyActiveImport: 10_000,
        powerActiveImport: 0,
        timestamp: new Date('2026-02-17T12:00:00.000Z'),
      },
      {
        energyActiveImport: 10_000,
        powerActiveImport: 0,
        timestamp: new Date('2026-02-17T12:40:00.000Z'),
      },
    ]);
    connectorsServiceMock.calculatePricing.mockResolvedValue(
      buildPricingResponse({
        chargingDurationMinutes: 0,
        idleDurationMinutes: 40,
        totalCost: 1700,
      }),
    );

    const result = await service.calculateSessionCost({
      connectorId: CONNECTOR_ID,
      energyDeliveredKwh: 0,
      sessionId: SESSION_ID,
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:40:00.000Z'),
    });

    expect(result).toEqual({
      chargingDurationMinutes: 0,
      idleDurationMinutes: 40,
      totalCost: 1700,
    });
  });

  it('avoids idle billing fallback when energy was delivered but meter activity cannot be derived', async () => {
    prismaMock.meterValue.findMany.mockResolvedValue([]);
    connectorsServiceMock.calculatePricing.mockResolvedValue(
      buildPricingResponse({
        chargingDurationMinutes: 40,
        idleDurationMinutes: 0,
        totalCost: 1900,
      }),
    );

    const result = await service.calculateSessionCost({
      connectorId: CONNECTOR_ID,
      energyDeliveredKwh: 2.4,
      sessionId: SESSION_ID,
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:40:00.000Z'),
    });

    expect(result).toEqual({
      chargingDurationMinutes: 40,
      idleDurationMinutes: 0,
      totalCost: 1900,
    });
  });

  it('returns zero cost without pricing lookups when session has no connector id', async () => {
    const result = await service.calculateSessionCost({
      connectorId: null,
      energyDeliveredKwh: 3.5,
      sessionId: SESSION_ID,
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:40:00.000Z'),
    });

    expect(result).toEqual({
      chargingDurationMinutes: 0,
      idleDurationMinutes: 0,
      totalCost: 0,
    });
    expect(prismaMock.meterValue.findMany).not.toHaveBeenCalled();
    expect(connectorsServiceMock.calculatePricing).not.toHaveBeenCalled();
  });
});
