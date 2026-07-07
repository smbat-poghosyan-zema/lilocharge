import type { Ocpp2TransactionEventRequest } from '@lilocharge/shared-types';
import { BadRequestException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';

import type { OcppMeterValuesService } from './ocpp.meter-values.service';
import type {
  OcppSessionLookupRecord,
  OcppTransactionsService,
} from './ocpp.transactions.service';
import {
  convertOcpp2MeterValues,
  extractEnergyRegisterWh,
  Ocpp2TransactionsService,
} from './ocpp2.transactions.service';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_CONNECTOR_ID = '22222222-2222-4222-8222-222222222222';
const TEST_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const TEST_TRANSACTION_ID = 'tx-2fa1c7de-0001';

interface TransactionsServiceMock
  extends Pick<
    OcppTransactionsService,
    | 'attachTransactionToTrackedRemoteStart'
    | 'createActiveOcppSession'
    | 'finalizeStoppedSession'
    | 'findSessionByTransactionId'
    | 'resolveConnectorId'
    | 'resolveUserId'
  > {
  readonly attachTransactionToTrackedRemoteStart: jest.Mock<
    ReturnType<OcppTransactionsService['attachTransactionToTrackedRemoteStart']>,
    Parameters<OcppTransactionsService['attachTransactionToTrackedRemoteStart']>
  >;
  readonly createActiveOcppSession: jest.Mock<
    ReturnType<OcppTransactionsService['createActiveOcppSession']>,
    Parameters<OcppTransactionsService['createActiveOcppSession']>
  >;
  readonly finalizeStoppedSession: jest.Mock<
    ReturnType<OcppTransactionsService['finalizeStoppedSession']>,
    Parameters<OcppTransactionsService['finalizeStoppedSession']>
  >;
  readonly findSessionByTransactionId: jest.Mock<
    ReturnType<OcppTransactionsService['findSessionByTransactionId']>,
    Parameters<OcppTransactionsService['findSessionByTransactionId']>
  >;
  readonly resolveConnectorId: jest.Mock<
    ReturnType<OcppTransactionsService['resolveConnectorId']>,
    Parameters<OcppTransactionsService['resolveConnectorId']>
  >;
  readonly resolveUserId: jest.Mock<
    ReturnType<OcppTransactionsService['resolveUserId']>,
    Parameters<OcppTransactionsService['resolveUserId']>
  >;
}

interface MeterValuesServiceMock
  extends Pick<OcppMeterValuesService, 'ingestSessionMeterValues'> {
  readonly ingestSessionMeterValues: jest.Mock<
    ReturnType<OcppMeterValuesService['ingestSessionMeterValues']>,
    Parameters<OcppMeterValuesService['ingestSessionMeterValues']>
  >;
}

/** Builds one active session lookup record fixture for TransactionEvent tests. */
function buildSessionRecord(overrides?: Partial<OcppSessionLookupRecord>): OcppSessionLookupRecord {
  return {
    connectorId: TEST_CONNECTOR_ID,
    createdAt: new Date('2026-02-17T12:00:00.000Z'),
    id: TEST_SESSION_ID,
    meterStart: 1000,
    startTime: new Date('2026-02-17T12:00:00.000Z'),
    status: SessionStatus.ACTIVE,
    userId: TEST_USER_ID,
    ...overrides,
  };
}

/** Builds one TransactionEvent request fixture with sensible defaults. */
function buildTransactionEvent(
  overrides?: Partial<Ocpp2TransactionEventRequest>,
): Ocpp2TransactionEventRequest {
  return {
    eventType: 'Started',
    evse: { connectorId: 1, id: 1 },
    idToken: { idToken: 'a1b2c3d4e5f601234567', type: 'Central' },
    seqNo: 0,
    timestamp: '2026-02-17T12:00:00.000Z',
    transactionInfo: { transactionId: TEST_TRANSACTION_ID },
    triggerReason: 'Authorized',
    ...overrides,
  };
}

describe('Ocpp2TransactionsService', () => {
  let meterValuesServiceMock: MeterValuesServiceMock;
  let service: Ocpp2TransactionsService;
  let transactionsServiceMock: TransactionsServiceMock;

  beforeEach(() => {
    transactionsServiceMock = {
      attachTransactionToTrackedRemoteStart: jest
        .fn<
          ReturnType<OcppTransactionsService['attachTransactionToTrackedRemoteStart']>,
          Parameters<OcppTransactionsService['attachTransactionToTrackedRemoteStart']>
        >()
        .mockResolvedValue(null),
      createActiveOcppSession: jest
        .fn<
          ReturnType<OcppTransactionsService['createActiveOcppSession']>,
          Parameters<OcppTransactionsService['createActiveOcppSession']>
        >()
        .mockResolvedValue({ id: TEST_SESSION_ID }),
      finalizeStoppedSession: jest
        .fn<
          ReturnType<OcppTransactionsService['finalizeStoppedSession']>,
          Parameters<OcppTransactionsService['finalizeStoppedSession']>
        >()
        .mockResolvedValue(1250),
      findSessionByTransactionId: jest
        .fn<
          ReturnType<OcppTransactionsService['findSessionByTransactionId']>,
          Parameters<OcppTransactionsService['findSessionByTransactionId']>
        >()
        .mockResolvedValue(buildSessionRecord()),
      resolveConnectorId: jest
        .fn<
          ReturnType<OcppTransactionsService['resolveConnectorId']>,
          Parameters<OcppTransactionsService['resolveConnectorId']>
        >()
        .mockResolvedValue(TEST_CONNECTOR_ID),
      resolveUserId: jest
        .fn<
          ReturnType<OcppTransactionsService['resolveUserId']>,
          Parameters<OcppTransactionsService['resolveUserId']>
        >()
        .mockResolvedValue(TEST_USER_ID),
    };
    meterValuesServiceMock = {
      ingestSessionMeterValues: jest
        .fn<
          ReturnType<OcppMeterValuesService['ingestSessionMeterValues']>,
          Parameters<OcppMeterValuesService['ingestSessionMeterValues']>
        >()
        .mockResolvedValue(1),
    };
    service = new Ocpp2TransactionsService(
      transactionsServiceMock as unknown as OcppTransactionsService,
      meterValuesServiceMock as unknown as OcppMeterValuesService,
    );
  });

  describe('handleAuthorize', () => {
    it('accepts idTokens that resolve to existing users', async () => {
      const response = await service.handleAuthorize('CP-201', {
        idToken: { idToken: 'a1b2c3d4e5f601234567', type: 'Central' },
      });

      expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
      expect(transactionsServiceMock.resolveUserId).toHaveBeenCalledWith('a1b2c3d4e5f601234567');
    });

    it('rejects idTokens that do not resolve to a user', async () => {
      transactionsServiceMock.resolveUserId.mockResolvedValue(null);

      const response = await service.handleAuthorize('CP-201', {
        idToken: { idToken: 'unknown-token', type: 'Central' },
      });

      expect(response).toEqual({ idTokenInfo: { status: 'Invalid' } });
    });

    it('rejects payloads without an idToken value', async () => {
      await expect(
        service.handleAuthorize('CP-201', {
          idToken: { idToken: '  ', type: 'Central' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('handleTransactionEvent Started', () => {
    it('creates one ACTIVE session with the register meterStart and string transaction id', async () => {
      const payload = buildTransactionEvent({
        meterValue: [
          {
            sampledValue: [
              {
                context: 'Transaction.Begin',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
                value: 1000,
              },
            ],
            timestamp: '2026-02-17T12:00:00.000Z',
          },
        ],
      });

      const response = await service.handleTransactionEvent('CP-201', payload);

      expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
      expect(transactionsServiceMock.resolveConnectorId).toHaveBeenCalledWith('CP-201', 1);
      expect(transactionsServiceMock.createActiveOcppSession).toHaveBeenCalledWith({
        connectorId: TEST_CONNECTOR_ID,
        meterStartWh: 1000,
        startedAt: new Date('2026-02-17T12:00:00.000Z'),
        transactionId: TEST_TRANSACTION_ID,
        userId: TEST_USER_ID,
      });
    });

    it('normalizes kWh register readings to Wh for meterStart', async () => {
      const payload = buildTransactionEvent({
        meterValue: [
          {
            sampledValue: [{ unitOfMeasure: { unit: 'kWh' }, value: 1.5 }],
            timestamp: '2026-02-17T12:00:00.000Z',
          },
        ],
      });

      await service.handleTransactionEvent('CP-201', payload);

      expect(transactionsServiceMock.createActiveOcppSession).toHaveBeenCalledWith(
        expect.objectContaining({ meterStartWh: 1500 }),
      );
    });

    it('returns Invalid and creates no session when the idToken does not resolve to a user', async () => {
      transactionsServiceMock.resolveUserId.mockResolvedValue(null);

      const response = await service.handleTransactionEvent('CP-201', buildTransactionEvent());

      expect(response).toEqual({ idTokenInfo: { status: 'Invalid' } });
      expect(transactionsServiceMock.createActiveOcppSession).not.toHaveBeenCalled();
    });

    it('returns Invalid and creates no session when the EVSE cannot be mapped', async () => {
      transactionsServiceMock.resolveConnectorId.mockResolvedValue(null);

      const response = await service.handleTransactionEvent('CP-201', buildTransactionEvent());

      expect(response).toEqual({ idTokenInfo: { status: 'Invalid' } });
      expect(transactionsServiceMock.createActiveOcppSession).not.toHaveBeenCalled();
    });

    it('falls back to the EVSE connectorId candidate when the EVSE id does not resolve', async () => {
      transactionsServiceMock.resolveConnectorId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(TEST_CONNECTOR_ID);

      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ evse: { connectorId: 2, id: 1 } }),
      );

      expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
      expect(transactionsServiceMock.resolveConnectorId).toHaveBeenNthCalledWith(1, 'CP-201', 1);
      expect(transactionsServiceMock.resolveConnectorId).toHaveBeenNthCalledWith(2, 'CP-201', 2);
    });

    it('acknowledges Started events without an idToken but never persists a session', async () => {
      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ idToken: undefined }),
      );

      expect(response).toEqual({});
      expect(transactionsServiceMock.createActiveOcppSession).not.toHaveBeenCalled();
    });

    it('attaches the transaction to a tracked remote-start API session instead of creating one', async () => {
      transactionsServiceMock.attachTransactionToTrackedRemoteStart.mockResolvedValue({
        id: TEST_SESSION_ID,
      });

      const response = await service.handleTransactionEvent('CP-201', buildTransactionEvent());

      expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
      expect(transactionsServiceMock.attachTransactionToTrackedRemoteStart).toHaveBeenCalledWith({
        chargePointId: 'CP-201',
        idTag: 'a1b2c3d4e5f601234567',
        meterStartWh: null,
        ocppConnectorId: 1,
        startedAt: new Date('2026-02-17T12:00:00.000Z'),
        transactionId: TEST_TRANSACTION_ID,
      });
      expect(transactionsServiceMock.createActiveOcppSession).not.toHaveBeenCalled();
    });

    it('answers ConcurrentTx and creates nothing when the connector already has a blocking session', async () => {
      transactionsServiceMock.createActiveOcppSession.mockResolvedValue(null);

      const response = await service.handleTransactionEvent('CP-201', buildTransactionEvent());

      expect(response).toEqual({ idTokenInfo: { status: 'ConcurrentTx' } });
    });
  });

  describe('handleTransactionEvent Updated', () => {
    it('ingests converted meter samples for the session bound to the transaction id', async () => {
      const payload = buildTransactionEvent({
        eventType: 'Updated',
        idToken: undefined,
        meterValue: [
          {
            sampledValue: [
              { measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' }, value: 3000 },
              { measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'kW' }, value: 22 },
              { measurand: 'Current.Import', unitOfMeasure: { unit: 'A' }, value: 32 },
              { measurand: 'Voltage', unitOfMeasure: { unit: 'V' }, value: 230 },
            ],
            timestamp: '2026-02-17T12:10:00.000Z',
          },
        ],
        triggerReason: 'MeterValuePeriodic',
      });

      const response = await service.handleTransactionEvent('CP-201', payload);

      expect(response).toEqual({});
      expect(transactionsServiceMock.findSessionByTransactionId).toHaveBeenCalledWith(
        'CP-201',
        TEST_TRANSACTION_ID,
      );
      expect(meterValuesServiceMock.ingestSessionMeterValues).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        [
          {
            sampledValue: [
              { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: '3000' },
              { measurand: 'Power.Active.Import', unit: 'kW', value: '22' },
              { measurand: 'Current.Import', unit: 'A', value: '32' },
              { measurand: 'Voltage', unit: 'V', value: '230' },
            ],
            timestamp: '2026-02-17T12:10:00.000Z',
          },
        ],
      );
    });

    it('echoes idTokenInfo for Updated events that carry an idToken', async () => {
      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ eventType: 'Updated' }),
      );

      expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
    });

    it('tolerates Updated events for unknown transactions', async () => {
      transactionsServiceMock.findSessionByTransactionId.mockResolvedValue(null);

      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ eventType: 'Updated', idToken: undefined }),
      );

      expect(response).toEqual({});
      expect(meterValuesServiceMock.ingestSessionMeterValues).not.toHaveBeenCalled();
    });
  });

  describe('handleTransactionEvent Ended', () => {
    it('finalizes the session with the Transaction.End register and returns totalCost', async () => {
      const payload = buildTransactionEvent({
        eventType: 'Ended',
        idToken: undefined,
        meterValue: [
          {
            sampledValue: [
              {
                context: 'Transaction.End',
                measurand: 'Energy.Active.Import.Register',
                unitOfMeasure: { unit: 'Wh' },
                value: 6000,
              },
            ],
            timestamp: '2026-02-17T12:30:00.000Z',
          },
        ],
        timestamp: '2026-02-17T12:30:00.000Z',
        triggerReason: 'StopAuthorized',
      });

      const response = await service.handleTransactionEvent('CP-201', payload);

      expect(response).toEqual({ totalCost: 1250 });
      expect(transactionsServiceMock.finalizeStoppedSession).toHaveBeenCalledWith(
        buildSessionRecord(),
        new Date('2026-02-17T12:30:00.000Z'),
        6000,
      );
    });

    it('finalizes without a register value when the Ended event carries no meter values', async () => {
      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ eventType: 'Ended', idToken: undefined }),
      );

      expect(response).toEqual({ totalCost: 1250 });
      expect(transactionsServiceMock.finalizeStoppedSession).toHaveBeenCalledWith(
        buildSessionRecord(),
        new Date('2026-02-17T12:00:00.000Z'),
        null,
      );
    });

    it('does not re-finalize sessions that are already completed', async () => {
      transactionsServiceMock.findSessionByTransactionId.mockResolvedValue(
        buildSessionRecord({ status: SessionStatus.COMPLETED }),
      );

      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ eventType: 'Ended', idToken: undefined }),
      );

      expect(response).toEqual({});
      expect(transactionsServiceMock.finalizeStoppedSession).not.toHaveBeenCalled();
    });

    it('tolerates Ended events for unknown transactions', async () => {
      transactionsServiceMock.findSessionByTransactionId.mockResolvedValue(null);

      const response = await service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ eventType: 'Ended', idToken: undefined }),
      );

      expect(response).toEqual({});
      expect(transactionsServiceMock.finalizeStoppedSession).not.toHaveBeenCalled();
    });
  });

  it('rejects TransactionEvent payloads without a transaction id', async () => {
    await expect(
      service.handleTransactionEvent(
        'CP-201',
        buildTransactionEvent({ transactionInfo: { transactionId: ' ' } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('extractEnergyRegisterWh', () => {
  it('prefers readings that match the requested transaction context', () => {
    const result = extractEnergyRegisterWh(
      [
        {
          sampledValue: [
            { context: 'Sample.Periodic', value: 4000 },
            { context: 'Transaction.End', value: 6000 },
          ],
          timestamp: '2026-02-17T12:30:00.000Z',
        },
      ],
      'Transaction.End',
    );

    expect(result).toBe(6000);
  });

  it('treats omitted measurands as the active import energy register (2.0.1 default)', () => {
    expect(
      extractEnergyRegisterWh(
        [{ sampledValue: [{ value: 1234 }], timestamp: '2026-02-17T12:00:00.000Z' }],
        'Transaction.Begin',
      ),
    ).toBe(1234);
  });

  it('ignores non-register measurands and unsupported units', () => {
    expect(
      extractEnergyRegisterWh(
        [
          {
            sampledValue: [
              { measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'kW' }, value: 22 },
              { unitOfMeasure: { unit: 'varh' }, value: 999 },
            ],
            timestamp: '2026-02-17T12:00:00.000Z',
          },
        ],
        'Transaction.Begin',
      ),
    ).toBeNull();
  });

  it('returns null when no meter values are present', () => {
    expect(extractEnergyRegisterWh(undefined, 'Transaction.Begin')).toBeNull();
  });
});

describe('convertOcpp2MeterValues', () => {
  it('applies the base-10 unit multiplier while converting values to strings', () => {
    const converted = convertOcpp2MeterValues([
      {
        sampledValue: [
          {
            measurand: 'Energy.Active.Import.Register',
            unitOfMeasure: { multiplier: 3, unit: 'Wh' },
            value: 5,
          },
        ],
        timestamp: '2026-02-17T12:00:00.000Z',
      },
    ]);

    expect(converted).toEqual([
      {
        sampledValue: [
          { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: '5000' },
        ],
        timestamp: '2026-02-17T12:00:00.000Z',
      },
    ]);
  });

  it('drops samples whose measurand or unit has no 1.6 equivalent', () => {
    const converted = convertOcpp2MeterValues([
      {
        sampledValue: [
          { measurand: 'Frequency', value: 50 },
          { measurand: 'Voltage', unitOfMeasure: { unit: 'Celsius' }, value: 25 },
          { context: 'Sample.Periodic', measurand: 'Voltage', unitOfMeasure: { unit: 'V' }, value: 230 },
        ],
        timestamp: '2026-02-17T12:00:00.000Z',
      },
    ]);

    expect(converted).toEqual([
      {
        sampledValue: [{ context: 'Sample.Periodic', measurand: 'Voltage', unit: 'V', value: '230' }],
        timestamp: '2026-02-17T12:00:00.000Z',
      },
    ]);
  });
});
