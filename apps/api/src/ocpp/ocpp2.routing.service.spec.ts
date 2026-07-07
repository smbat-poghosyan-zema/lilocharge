import type {
  Ocpp2BootNotificationResponse,
  Ocpp2HeartbeatResponse,
  Ocpp2StatusNotificationRequest,
  Ocpp2TransactionEventRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, Ocpp2Action, StationStatus } from '@lilocharge/shared-types';
import { NotFoundException } from '@nestjs/common';

import type { ConnectorsService } from '../connectors/connectors.service';
import type { StationStatusBroadcastService } from './ocpp.status-broadcast.service';
import type { OcppRpcHandler, OcppServerClient } from './ocpp.server.types';
import type { Ocpp2TransactionsService } from './ocpp2.transactions.service';
import { OcppRegistryService } from './ocpp.registry.service';
import { Ocpp2RoutingService, ROUTED_OCPP2_ACTIONS } from './ocpp2.routing.service';

interface OcppClientFixture {
  readonly client: OcppServerClient;
  readonly handleMock: jest.Mock<void, [string | OcppRpcHandler, OcppRpcHandler?]>;
}

interface ConnectorsServiceMock
  extends Pick<ConnectorsService, 'updateConnectorStatusFromOcppNotification'> {
  readonly updateConnectorStatusFromOcppNotification: jest.Mock<
    ReturnType<ConnectorsService['updateConnectorStatusFromOcppNotification']>,
    Parameters<ConnectorsService['updateConnectorStatusFromOcppNotification']>
  >;
}

interface StationStatusBroadcastServiceMock
  extends Pick<StationStatusBroadcastService, 'broadcastConnectorStatusUpdate'> {
  readonly broadcastConnectorStatusUpdate: jest.Mock<
    void,
    Parameters<StationStatusBroadcastService['broadcastConnectorStatusUpdate']>
  >;
}

interface Ocpp2TransactionsServiceMock
  extends Pick<Ocpp2TransactionsService, 'handleAuthorize' | 'handleTransactionEvent'> {
  readonly handleAuthorize: jest.Mock<
    ReturnType<Ocpp2TransactionsService['handleAuthorize']>,
    Parameters<Ocpp2TransactionsService['handleAuthorize']>
  >;
  readonly handleTransactionEvent: jest.Mock<
    ReturnType<Ocpp2TransactionsService['handleTransactionEvent']>,
    Parameters<Ocpp2TransactionsService['handleTransactionEvent']>
  >;
}

/** Builds a connector response fixture returned by connector status update calls. */
function buildConnectorResponse(): Awaited<
  ReturnType<ConnectorsService['updateConnectorStatusFromOcppNotification']>
> {
  return {
    connectorType: ConnectorType.CCS,
    createdAt: '2026-02-17T08:00:00.000Z',
    evseId: 'CP-201-evse-1',
    id: '44444444-4444-4444-4444-444444444444',
    lastStatusUpdate: '2026-02-17T08:00:00.000Z',
    powerKw: 120,
    stationId: '33333333-3333-3333-3333-333333333333',
    status: StationStatus.OCCUPIED,
    updatedAt: '2026-02-17T08:00:00.000Z',
  };
}

/** Builds an OCPP 2.0.1 client fixture for routing tests. */
function buildClient(identity: string): OcppClientFixture {
  const handleMock = jest.fn<void, [string | OcppRpcHandler, OcppRpcHandler?]>();

  return {
    client: {
      handle: handleMock,
      handshake: { endpoint: '/ocpp' },
      identity,
      on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
      protocol: 'ocpp2.0.1',
      session: {},
    },
    handleMock,
  };
}

describe('Ocpp2RoutingService', () => {
  let broadcastServiceMock: StationStatusBroadcastServiceMock;
  let connectorsServiceMock: ConnectorsServiceMock;
  let registryService: OcppRegistryService;
  let routingService: Ocpp2RoutingService;
  let transactionsServiceMock: Ocpp2TransactionsServiceMock;

  beforeEach(() => {
    broadcastServiceMock = {
      broadcastConnectorStatusUpdate: jest.fn<
        void,
        Parameters<StationStatusBroadcastService['broadcastConnectorStatusUpdate']>
      >(),
    };
    connectorsServiceMock = {
      updateConnectorStatusFromOcppNotification: jest.fn<
        ReturnType<ConnectorsService['updateConnectorStatusFromOcppNotification']>,
        Parameters<ConnectorsService['updateConnectorStatusFromOcppNotification']>
      >(),
    };
    connectorsServiceMock.updateConnectorStatusFromOcppNotification.mockResolvedValue(
      buildConnectorResponse(),
    );
    transactionsServiceMock = {
      handleAuthorize: jest
        .fn<
          ReturnType<Ocpp2TransactionsService['handleAuthorize']>,
          Parameters<Ocpp2TransactionsService['handleAuthorize']>
        >()
        .mockResolvedValue({ idTokenInfo: { status: 'Accepted' } }),
      handleTransactionEvent: jest
        .fn<
          ReturnType<Ocpp2TransactionsService['handleTransactionEvent']>,
          Parameters<Ocpp2TransactionsService['handleTransactionEvent']>
        >()
        .mockResolvedValue({ idTokenInfo: { status: 'Accepted' } }),
    };
    registryService = new OcppRegistryService();
    routingService = new Ocpp2RoutingService(
      registryService,
      connectorsServiceMock as unknown as ConnectorsService,
      broadcastServiceMock as unknown as StationStatusBroadcastService,
      transactionsServiceMock as unknown as Ocpp2TransactionsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('attaches one handler per routed 2.0.1 action plus a wildcard fallback handler', () => {
    const fixture = buildClient('CP-201');
    registryService.registerChargePoint(fixture.client);

    routingService.attachClientHandlers(fixture.client);

    expect(fixture.handleMock).toHaveBeenCalledTimes(ROUTED_OCPP2_ACTIONS.length + 1);
    ROUTED_OCPP2_ACTIONS.forEach((action) => {
      expect(fixture.handleMock).toHaveBeenCalledWith(action, expect.any(Function));
    });
    expect(fixture.handleMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it('returns a 2.0.1 BootNotification acceptance and records mapped boot metadata', async () => {
    const now = new Date('2026-02-17T08:10:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const fixture = buildClient('CP-201');
    registryService.registerChargePoint(fixture.client);

    const response = (await routingService.routeIncomingMessage(
      'CP-201',
      Ocpp2Action.BOOT_NOTIFICATION,
      {
        chargingStation: {
          firmwareVersion: '2.1.0',
          model: 'Terra AC',
          serialNumber: 'SN-201-001',
          vendorName: 'ABB',
        },
        reason: 'PowerUp',
      },
    )) as Ocpp2BootNotificationResponse;

    const registration = registryService.getChargePoint('CP-201');

    expect(response).toEqual({
      currentTime: '2026-02-17T08:10:00.000Z',
      interval: 300,
      status: 'Accepted',
    });
    expect(registration?.registrationStatus).toBe('Accepted');
    expect(registration?.lastBootNotification).toEqual({
      chargePointModel: 'Terra AC',
      chargePointSerialNumber: 'SN-201-001',
      chargePointVendor: 'ABB',
      firmwareVersion: '2.1.0',
    });
  });

  it('returns a Heartbeat response and tracks the latest heartbeat timestamp', async () => {
    const now = new Date('2026-02-17T08:15:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const fixture = buildClient('CP-201');
    registryService.registerChargePoint(fixture.client);

    const response = (await routingService.routeIncomingMessage(
      'CP-201',
      Ocpp2Action.HEARTBEAT,
      {},
    )) as Ocpp2HeartbeatResponse;
    const registration = registryService.getChargePoint('CP-201');

    expect(response.currentTime).toBe('2026-02-17T08:15:00.000Z');
    expect(registration?.lastHeartbeatAt).toBe('2026-02-17T08:15:00.000Z');
  });

  it.each([
    ['Available', StationStatus.AVAILABLE],
    ['Occupied', StationStatus.OCCUPIED],
    ['Reserved', StationStatus.OCCUPIED],
    ['Unavailable', StationStatus.OFFLINE],
    ['Faulted', StationStatus.MAINTENANCE],
  ] as const)(
    'maps 2.0.1 connector status %s to %s and broadcasts the update',
    async (connectorStatus, expectedStatus) => {
      const payload: Ocpp2StatusNotificationRequest = {
        connectorId: 1,
        connectorStatus,
        evseId: 1,
        timestamp: '2026-02-17T08:20:00.000Z',
      };

      const response = await routingService.routeIncomingMessage(
        'CP-201',
        Ocpp2Action.STATUS_NOTIFICATION,
        payload,
      );

      expect(response).toEqual({});
      expect(connectorsServiceMock.updateConnectorStatusFromOcppNotification).toHaveBeenCalledWith(
        'CP-201',
        1,
        {
          lastStatusUpdate: '2026-02-17T08:20:00.000Z',
          status: expectedStatus,
        },
      );
      expect(broadcastServiceMock.broadcastConnectorStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          chargePointId: 'CP-201',
          event: 'connector.status.updated',
          occurredAt: '2026-02-17T08:20:00.000Z',
          ocppConnectorId: 1,
          ocppStatus: connectorStatus,
        }),
      );
    },
  );

  it('acknowledges StatusNotification payloads when connector lookup fails', async () => {
    connectorsServiceMock.updateConnectorStatusFromOcppNotification.mockRejectedValue(
      new NotFoundException('Connector not found'),
    );

    await expect(
      routingService.routeIncomingMessage('CP-404', Ocpp2Action.STATUS_NOTIFICATION, {
        connectorId: 1,
        connectorStatus: 'Available',
        evseId: 99,
        timestamp: '2026-02-17T08:20:00.000Z',
      }),
    ).resolves.toEqual({});

    expect(broadcastServiceMock.broadcastConnectorStatusUpdate).not.toHaveBeenCalled();
  });

  it('acknowledges standalone MeterValues messages without persistence', async () => {
    const response = await routingService.routeIncomingMessage('CP-201', Ocpp2Action.METER_VALUES, {
      evseId: 1,
      meterValue: [
        {
          sampledValue: [{ value: 230 }],
          timestamp: '2026-02-17T08:25:00.000Z',
        },
      ],
    });

    expect(response).toEqual({});
  });

  it('routes Authorize payloads through the 2.0.1 transactions service', async () => {
    const payload = { idToken: { idToken: 'a1b2c3d4e5f601234567', type: 'Central' as const } };

    const response = await routingService.routeIncomingMessage(
      'CP-201',
      Ocpp2Action.AUTHORIZE,
      payload,
    );

    expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
    expect(transactionsServiceMock.handleAuthorize).toHaveBeenCalledWith('CP-201', payload);
  });

  it('routes TransactionEvent payloads through the 2.0.1 transactions service', async () => {
    const payload: Ocpp2TransactionEventRequest = {
      eventType: 'Started',
      evse: { connectorId: 1, id: 1 },
      idToken: { idToken: 'a1b2c3d4e5f601234567', type: 'Central' },
      seqNo: 0,
      timestamp: '2026-02-17T08:30:00.000Z',
      transactionInfo: { transactionId: 'tx-0001' },
      triggerReason: 'Authorized',
    };

    const response = await routingService.routeIncomingMessage(
      'CP-201',
      Ocpp2Action.TRANSACTION_EVENT,
      payload,
    );

    expect(response).toEqual({ idTokenInfo: { status: 'Accepted' } });
    expect(transactionsServiceMock.handleTransactionEvent).toHaveBeenCalledWith('CP-201', payload);
  });

  it('marks the charge point as seen for every routed message', async () => {
    const now = new Date('2026-02-17T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const fixture = buildClient('CP-201');
    registryService.registerChargePoint(fixture.client, new Date('2026-02-17T08:00:00.000Z'));

    await routingService.routeIncomingMessage('CP-201', Ocpp2Action.HEARTBEAT, {});

    expect(registryService.getChargePoint('CP-201')?.lastSeenAt).toBe('2026-02-17T09:00:00.000Z');
  });

  it('rejects OCPP actions outside the routed 2.0.1 set via NotImplemented errors', async () => {
    await expect(
      routingService.routeIncomingMessage('CP-201', 'GetBaseReport', {}),
    ).rejects.toBeInstanceOf(Error);
    // 1.6-only action names must not leak into the 2.0.1 router either.
    await expect(
      routingService.routeIncomingMessage('CP-201', 'StartTransaction', {}),
    ).rejects.toBeInstanceOf(Error);
  });
});
