import { SESSION_MONITOR_UPDATE_EVENT } from '@lilocharge/shared-types';

import type { PrismaService } from '../prisma/prisma.service';
import type {
  SessionCostCalculationResult,
  SessionCostCalculatorService,
} from './session-cost-calculator.service';
import type { SessionMonitoringGateway } from './session-monitoring.gateway';
import { SessionMonitoringService } from './session-monitoring.service';

interface SessionLookupRecord {
  readonly connectorId: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly startTime: Date | null;
  readonly transactionId: string | null;
}

interface MeterValueAggregateResult {
  readonly _max: {
    readonly energyActiveImport: number | null;
  };
  readonly _min: {
    readonly energyActiveImport: number | null;
  };
}

interface LatestMeterValueRecord {
  readonly powerActiveImport: number;
  readonly timestamp: Date;
}

interface PrismaSessionDelegateMock {
  readonly findUnique: jest.Mock<Promise<SessionLookupRecord | null>, [unknown]>;
}

interface PrismaMeterValueDelegateMock {
  readonly aggregate: jest.Mock<Promise<MeterValueAggregateResult>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<LatestMeterValueRecord | null>, [unknown]>;
}

interface PrismaServiceMock {
  readonly meterValue: PrismaMeterValueDelegateMock;
  readonly session: PrismaSessionDelegateMock;
}

interface SessionCostCalculatorServiceMock extends Pick<
  SessionCostCalculatorService,
  'calculateSessionCost'
> {
  readonly calculateSessionCost: jest.Mock<
    Promise<SessionCostCalculationResult>,
    Parameters<SessionCostCalculatorService['calculateSessionCost']>
  >;
}

interface SessionMonitoringGatewayMock extends Pick<
  SessionMonitoringGateway,
  'emitSessionMonitorUpdate'
> {
  readonly emitSessionMonitorUpdate: jest.Mock<
    ReturnType<SessionMonitoringGateway['emitSessionMonitorUpdate']>,
    Parameters<SessionMonitoringGateway['emitSessionMonitorUpdate']>
  >;
}

describe('SessionMonitoringService', () => {
  let gatewayMock: SessionMonitoringGatewayMock;
  let prismaMock: PrismaServiceMock;
  let service: SessionMonitoringService;
  let sessionCostCalculatorServiceMock: SessionCostCalculatorServiceMock;

  beforeEach(() => {
    prismaMock = {
      meterValue: {
        aggregate: jest.fn<Promise<MeterValueAggregateResult>, [unknown]>(),
        findFirst: jest.fn<Promise<LatestMeterValueRecord | null>, [unknown]>(),
      },
      session: {
        findUnique: jest.fn<Promise<SessionLookupRecord | null>, [unknown]>(),
      },
    };
    sessionCostCalculatorServiceMock = {
      calculateSessionCost: jest.fn<
        ReturnType<SessionCostCalculatorService['calculateSessionCost']>,
        Parameters<SessionCostCalculatorService['calculateSessionCost']>
      >(),
    };
    gatewayMock = {
      emitSessionMonitorUpdate: jest.fn<
        ReturnType<SessionMonitoringGateway['emitSessionMonitorUpdate']>,
        Parameters<SessionMonitoringGateway['emitSessionMonitorUpdate']>
      >(),
    };

    service = new SessionMonitoringService(
      prismaMock as unknown as PrismaService,
      sessionCostCalculatorServiceMock as unknown as SessionCostCalculatorService,
      gatewayMock as unknown as SessionMonitoringGateway,
    );
  });

  it('computes live metrics and emits one session monitor event', async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      connectorId: '33333333-3333-3333-3333-333333333333',
      createdAt: new Date('2026-02-17T12:00:00.000Z'),
      id: 'session-1',
      startTime: new Date('2026-02-17T12:02:00.000Z'),
      transactionId: '7701',
    });
    prismaMock.meterValue.aggregate.mockResolvedValue({
      _max: {
        energyActiveImport: 13_750,
      },
      _min: {
        energyActiveImport: 10_000,
      },
    });
    prismaMock.meterValue.findFirst.mockResolvedValue({
      powerActiveImport: 7_200,
      timestamp: new Date('2026-02-17T12:25:00.000Z'),
    });
    sessionCostCalculatorServiceMock.calculateSessionCost.mockResolvedValue({
      chargingDurationMinutes: 23,
      idleDurationMinutes: 0,
      totalCost: 1880,
    });

    await service.publishSessionMonitorUpdate('session-1');

    expect(sessionCostCalculatorServiceMock.calculateSessionCost).toHaveBeenCalledWith({
      connectorId: '33333333-3333-3333-3333-333333333333',
      energyDeliveredKwh: 3.75,
      sessionId: 'session-1',
      startedAt: new Date('2026-02-17T12:02:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:25:00.000Z'),
    });
    expect(gatewayMock.emitSessionMonitorUpdate).toHaveBeenCalledWith({
      connectorId: '33333333-3333-3333-3333-333333333333',
      energyDeliveredKwh: 3.75,
      event: SESSION_MONITOR_UPDATE_EVENT,
      powerKw: 7.2,
      sessionId: 'session-1',
      timestamp: '2026-02-17T12:25:00.000Z',
      totalCost: 1880,
      transactionId: '7701',
    });
  });

  it('falls back to zero total cost when live pricing calculation fails', async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      connectorId: '33333333-3333-3333-3333-333333333333',
      createdAt: new Date('2026-02-17T12:00:00.000Z'),
      id: 'session-1',
      startTime: null,
      transactionId: '7701',
    });
    prismaMock.meterValue.aggregate.mockResolvedValue({
      _max: {
        energyActiveImport: 15_000,
      },
      _min: {
        energyActiveImport: 10_000,
      },
    });
    prismaMock.meterValue.findFirst.mockResolvedValue({
      powerActiveImport: 5_500,
      timestamp: new Date('2026-02-17T12:25:00.000Z'),
    });
    sessionCostCalculatorServiceMock.calculateSessionCost.mockRejectedValue(
      new Error('pricing unavailable'),
    );

    await service.publishSessionMonitorUpdate('session-1');

    expect(gatewayMock.emitSessionMonitorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCost: 0,
      }),
    );
  });

  it('skips emission when session or meter values cannot be resolved', async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);

    await service.publishSessionMonitorUpdate('session-1');
    expect(gatewayMock.emitSessionMonitorUpdate).not.toHaveBeenCalled();

    prismaMock.session.findUnique.mockResolvedValue({
      connectorId: null,
      createdAt: new Date('2026-02-17T12:00:00.000Z'),
      id: 'session-1',
      startTime: null,
      transactionId: null,
    });
    prismaMock.meterValue.findFirst.mockResolvedValue(null);

    await service.publishSessionMonitorUpdate('session-1');
    expect(gatewayMock.emitSessionMonitorUpdate).not.toHaveBeenCalled();
  });
});
