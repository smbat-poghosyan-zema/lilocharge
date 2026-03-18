import type { OcppMeterValuesRequest } from '@lilocharge/shared-types';

import type { PrismaService } from '../prisma/prisma.service';
import type { SessionMonitoringService } from '../sessions/session-monitoring.service';
import { OcppMeterValuesService } from './ocpp.meter-values.service';

interface PrismaConnectorDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaSessionDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaMeterValueDelegateMock {
  readonly createMany: jest.Mock<Promise<{ readonly count: number }>, [unknown]>;
}

interface PrismaServiceMock {
  readonly connector: PrismaConnectorDelegateMock;
  readonly meterValue: PrismaMeterValueDelegateMock;
  readonly session: PrismaSessionDelegateMock;
}

interface SessionMonitoringServiceMock extends Pick<
  SessionMonitoringService,
  'publishSessionMonitorUpdate'
> {
  readonly publishSessionMonitorUpdate: jest.Mock<
    ReturnType<SessionMonitoringService['publishSessionMonitorUpdate']>,
    Parameters<SessionMonitoringService['publishSessionMonitorUpdate']>
  >;
}

interface MeterValueCreateManyInput {
  readonly createdAt: Date;
  readonly currentImport: number;
  readonly energyActiveImport: number;
  readonly id: string;
  readonly powerActiveImport: number;
  readonly sessionId: string;
  readonly soc: number | null;
  readonly timestamp: Date;
  readonly voltage: number;
}

/** Builds a valid MeterValues payload fixture with optional overrides for tests. */
function buildMeterValuesPayload(
  overrides?: Partial<OcppMeterValuesRequest>,
): OcppMeterValuesRequest {
  return {
    connectorId: 2,
    meterValue: [
      {
        sampledValue: [
          { measurand: 'Energy.Active.Import.Register', unit: 'kWh', value: '12.5' },
          { measurand: 'Power.Active.Import', unit: 'kW', value: '7.2' },
          { measurand: 'Current.Import', unit: 'A', value: '18' },
          { measurand: 'Voltage', unit: 'V', value: '400' },
          { measurand: 'SoC', unit: 'Percent', value: '64' },
        ],
        timestamp: '2026-02-17T12:00:00.000Z',
      },
      {
        sampledValue: [
          { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: '12600' },
          { measurand: 'Power.Active.Import', unit: 'W', value: '7100' },
          { measurand: 'Current.Import', unit: 'A', value: '17.9' },
          { measurand: 'Voltage', unit: 'V', value: '401.1' },
        ],
        timestamp: '2026-02-17T12:00:30.000Z',
      },
    ],
    transactionId: 7701,
    ...overrides,
  };
}

describe('OcppMeterValuesService', () => {
  let prismaMock: PrismaServiceMock;
  let sessionMonitoringServiceMock: SessionMonitoringServiceMock;
  let service: OcppMeterValuesService;

  beforeEach(() => {
    prismaMock = {
      connector: {
        findFirst: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
      meterValue: {
        createMany: jest.fn<Promise<{ readonly count: number }>, [unknown]>(),
      },
      session: {
        findFirst: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
    };
    sessionMonitoringServiceMock = {
      publishSessionMonitorUpdate: jest.fn<
        ReturnType<SessionMonitoringService['publishSessionMonitorUpdate']>,
        Parameters<SessionMonitoringService['publishSessionMonitorUpdate']>
      >(),
    };
    service = new OcppMeterValuesService(
      prismaMock as unknown as PrismaService,
      sessionMonitoringServiceMock as unknown as SessionMonitoringService,
    );
  });

  it('resolves session by charge point and transaction id, then inserts normalized meter samples', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.session.findFirst.mockResolvedValue({ id: 'session-1' });
    prismaMock.meterValue.createMany.mockResolvedValue({ count: 2 });

    const insertedCount = await service.ingestMeterValues(
      'ev-armenia-001',
      buildMeterValuesPayload(),
    );

    expect(insertedCount).toBe(2);
    expect(prismaMock.connector.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { evseId: 'ev-armenia-001-evse-2' },
            { evseId: 'ev-armenia-001-2' },
            { evseId: '2' },
          ],
          station: {
            operatorId: 'ev-armenia-001',
          },
        },
      }),
    );
    expect(prismaMock.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          connectorId: 'connector-1',
          transactionId: '7701',
        },
      }),
    );

    const [createManyCall] = prismaMock.meterValue.createMany.mock.calls[0] ?? [];
    const data = (
      createManyCall as {
        readonly data: readonly MeterValueCreateManyInput[];
        readonly skipDuplicates: boolean;
      }
    ).data;

    expect(data).toHaveLength(2);
    expect(data[0]).toEqual(
      expect.objectContaining({
        createdAt: new Date('2026-02-17T12:00:00.000Z'),
        currentImport: 18,
        energyActiveImport: 12500,
        powerActiveImport: 7200,
        sessionId: 'session-1',
        soc: 64,
        timestamp: new Date('2026-02-17T12:00:00.000Z'),
        voltage: 400,
      }),
    );
    expect(typeof data[0]?.id).toBe('string');
    expect(data[1]).toEqual(
      expect.objectContaining({
        createdAt: new Date('2026-02-17T12:00:30.000Z'),
        currentImport: 17.9,
        energyActiveImport: 12600,
        powerActiveImport: 7100,
        sessionId: 'session-1',
        soc: null,
        timestamp: new Date('2026-02-17T12:00:30.000Z'),
        voltage: 401.1,
      }),
    );
    expect(typeof data[1]?.id).toBe('string');
    expect(
      createManyCall as {
        readonly data: readonly MeterValueCreateManyInput[];
        readonly skipDuplicates: boolean;
      },
    ).toEqual(
      expect.objectContaining({
        skipDuplicates: true,
      }),
    );
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).toHaveBeenCalledWith(
      'session-1',
    );
  });

  it('skips ingestion when transaction id is missing from the MeterValues payload', async () => {
    const insertedCount = await service.ingestMeterValues(
      'ev-armenia-001',
      buildMeterValuesPayload({
        transactionId: undefined,
      }),
    );

    expect(insertedCount).toBe(0);
    expect(prismaMock.connector.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.meterValue.createMany).not.toHaveBeenCalled();
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).not.toHaveBeenCalled();
  });

  it('skips ingestion when no connector or session can be resolved', async () => {
    prismaMock.connector.findFirst.mockResolvedValue(null);

    const insertedCount = await service.ingestMeterValues(
      'ev-armenia-001',
      buildMeterValuesPayload(),
    );

    expect(insertedCount).toBe(0);
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.meterValue.createMany).not.toHaveBeenCalled();
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).not.toHaveBeenCalled();
  });

  it('skips ingestion when a matching session cannot be resolved for the transaction id', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.session.findFirst.mockResolvedValue(null);

    const insertedCount = await service.ingestMeterValues(
      'ev-armenia-001',
      buildMeterValuesPayload(),
    );

    expect(insertedCount).toBe(0);
    expect(prismaMock.meterValue.createMany).not.toHaveBeenCalled();
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).not.toHaveBeenCalled();
  });

  it('skips ingestion when connector id is invalid', async () => {
    const insertedCount = await service.ingestMeterValues('ev-armenia-001', {
      connectorId: 0,
      meterValue: [],
      transactionId: 7701,
    });

    expect(insertedCount).toBe(0);
    expect(prismaMock.connector.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.meterValue.createMany).not.toHaveBeenCalled();
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).not.toHaveBeenCalled();
  });

  it('filters invalid meter entries and only persists complete valid samples', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.session.findFirst.mockResolvedValue({ id: 'session-1' });
    prismaMock.meterValue.createMany.mockResolvedValue({ count: 1 });

    const insertedCount = await service.ingestMeterValues('ev-armenia-001', {
      connectorId: 2,
      meterValue: [
        {
          sampledValue: [
            { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: '1000' },
            { measurand: 'Power.Active.Import', unit: 'W', value: '7000' },
            { measurand: 'Current.Import', unit: 'A', value: '17' },
            { measurand: 'Voltage', unit: 'V', value: '400' },
          ],
          timestamp: 'not-a-date',
        },
        {
          sampledValue: [
            { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: '1100' },
            { measurand: 'Power.Active.Import', unit: 'W', value: '7100' },
            { measurand: 'Current.Import', unit: 'A', value: '17.1' },
          ],
          timestamp: '2026-02-17T12:01:00.000Z',
        },
        {
          sampledValue: [
            { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: '1200' },
            { measurand: 'Power.Active.Import', unit: 'W', value: '7200' },
            { measurand: 'Current.Import', unit: 'A', value: '17.2' },
            { measurand: 'Voltage', unit: 'V', value: '401.2' },
          ],
          timestamp: '2026-02-17T12:01:30.000Z',
        },
      ],
      transactionId: 7701,
    });

    expect(insertedCount).toBe(1);

    const [createManyCall] = prismaMock.meterValue.createMany.mock.calls[0] ?? [];
    const data = (createManyCall as { readonly data: readonly MeterValueCreateManyInput[] }).data;

    expect(data).toHaveLength(1);
    expect(data[0]).toEqual(
      expect.objectContaining({
        currentImport: 17.2,
        energyActiveImport: 1200,
        powerActiveImport: 7200,
        soc: null,
        voltage: 401.2,
      }),
    );
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).toHaveBeenCalledWith(
      'session-1',
    );
  });

  it('skips database writes when all samples are invalid for storage', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.session.findFirst.mockResolvedValue({ id: 'session-1' });

    const insertedCount = await service.ingestMeterValues('ev-armenia-001', {
      connectorId: 2,
      meterValue: [
        {
          sampledValue: [{ measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: 'NaN' }],
          timestamp: '2026-02-17T12:02:00.000Z',
        },
      ],
      transactionId: 7701,
    });

    expect(insertedCount).toBe(0);
    expect(prismaMock.meterValue.createMany).not.toHaveBeenCalled();
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).not.toHaveBeenCalled();
  });

  it('returns inserted count when session monitor emission fails', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.session.findFirst.mockResolvedValue({ id: 'session-1' });
    prismaMock.meterValue.createMany.mockResolvedValue({ count: 2 });
    sessionMonitoringServiceMock.publishSessionMonitorUpdate.mockRejectedValue(
      new Error('socket offline'),
    );

    const insertedCount = await service.ingestMeterValues(
      'ev-armenia-001',
      buildMeterValuesPayload(),
    );

    expect(insertedCount).toBe(2);
    expect(sessionMonitoringServiceMock.publishSessionMonitorUpdate).toHaveBeenCalledWith(
      'session-1',
    );
  });
});
