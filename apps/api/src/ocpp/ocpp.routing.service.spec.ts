import {
  OcppAction,
  type OcppBootNotificationResponse,
  type OcppHeartbeatResponse,
  type OcppMeterValuesRequest,
  type OcppStartTransactionRequest,
  type OcppStartTransactionResponse,
  type OcppStopTransactionRequest,
  type OcppStopTransactionResponse,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { NotFoundException } from '@nestjs/common';

import type { StationStatusBroadcastService } from './ocpp.status-broadcast.service';
import type { ConnectorsService } from '../connectors/connectors.service';
import type { OcppMeterValuesService } from './ocpp.meter-values.service';
import type { OcppRpcHandler, OcppServerClient } from './ocpp.server.types';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRoutingService, ROUTED_OCPP_ACTIONS } from './ocpp.routing.service';
import type { OcppTransactionsService } from './ocpp.transactions.service';

interface OcppClientFixture {
  readonly client: OcppServerClient;
  readonly handleMock: jest.Mock<void, [string | OcppRpcHandler, OcppRpcHandler?]>;
}

interface ConnectorsServiceMock extends Pick<
  ConnectorsService,
  'updateConnectorStatusFromOcppNotification'
> {
  readonly updateConnectorStatusFromOcppNotification: jest.Mock<
    Promise<{
      readonly connectorType: ConnectorType;
      readonly createdAt: string;
      readonly evseId: string;
      readonly id: string;
      readonly lastStatusUpdate: string;
      readonly powerKw: number;
      readonly stationId: string;
      readonly status: StationStatus;
      readonly updatedAt: string;
    }>,
    [string, number, { readonly lastStatusUpdate?: string; readonly status: StationStatus }]
  >;
}

interface StationStatusBroadcastServiceMock extends Pick<
  StationStatusBroadcastService,
  'broadcastConnectorStatusUpdate'
> {
  readonly broadcastConnectorStatusUpdate: jest.Mock<
    void,
    [
      {
        readonly chargePointId: string;
        readonly connector: {
          readonly connectorType: ConnectorType;
          readonly createdAt: string;
          readonly evseId: string;
          readonly id: string;
          readonly lastStatusUpdate: string;
          readonly powerKw: number;
          readonly stationId: string;
          readonly status: StationStatus;
          readonly updatedAt: string;
        };
        readonly event: 'connector.status.updated';
        readonly occurredAt: string;
        readonly ocppConnectorId: number;
        readonly ocppStatus: string;
      },
    ]
  >;
}

interface MeterValuesServiceMock extends Pick<OcppMeterValuesService, 'ingestMeterValues'> {
  readonly ingestMeterValues: jest.Mock<Promise<number>, [string, OcppMeterValuesRequest]>;
}

interface TransactionsServiceMock extends Pick<
  OcppTransactionsService,
  'handleStartTransaction' | 'handleStopTransaction'
> {
  readonly handleStartTransaction: jest.Mock<
    ReturnType<OcppTransactionsService['handleStartTransaction']>,
    Parameters<OcppTransactionsService['handleStartTransaction']>
  >;
  readonly handleStopTransaction: jest.Mock<
    ReturnType<OcppTransactionsService['handleStopTransaction']>,
    Parameters<OcppTransactionsService['handleStopTransaction']>
  >;
}

/** Builds a connector response fixture returned by connector status update calls. */
function buildConnectorResponse(): {
  readonly connectorType: ConnectorType;
  readonly createdAt: string;
  readonly evseId: string;
  readonly id: string;
  readonly lastStatusUpdate: string;
  readonly powerKw: number;
  readonly stationId: string;
  readonly status: StationStatus;
  readonly updatedAt: string;
} {
  return {
    connectorType: ConnectorType.CCS,
    createdAt: '2026-02-17T08:00:00.000Z',
    evseId: 'ev-armenia-001-evse-1',
    id: '44444444-4444-4444-4444-444444444444',
    lastStatusUpdate: '2026-02-17T08:00:00.000Z',
    powerKw: 120,
    stationId: '33333333-3333-3333-3333-333333333333',
    status: StationStatus.OCCUPIED,
    updatedAt: '2026-02-17T08:00:00.000Z',
  };
}

/** Builds an OCPP client fixture for routing tests. */
function buildClient(identity: string): OcppClientFixture {
  const handleMock = jest.fn<void, [string | OcppRpcHandler, OcppRpcHandler?]>();

  return {
    client: {
      handle: handleMock,
      handshake: { endpoint: '/ocpp' },
      identity,
      on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
      protocol: 'ocpp1.6',
      session: {},
    },
    handleMock,
  };
}

describe('OcppRoutingService', () => {
  let broadcastServiceMock: StationStatusBroadcastServiceMock;
  let connectorsServiceMock: ConnectorsServiceMock;
  let meterValuesServiceMock: MeterValuesServiceMock;
  let registryService: OcppRegistryService;
  let routingService: OcppRoutingService;
  let transactionsServiceMock: TransactionsServiceMock;

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
    meterValuesServiceMock = {
      ingestMeterValues: jest.fn<
        ReturnType<OcppMeterValuesService['ingestMeterValues']>,
        Parameters<OcppMeterValuesService['ingestMeterValues']>
      >(),
    };
    meterValuesServiceMock.ingestMeterValues.mockResolvedValue(0);
    transactionsServiceMock = {
      handleStartTransaction: jest.fn<
        ReturnType<OcppTransactionsService['handleStartTransaction']>,
        Parameters<OcppTransactionsService['handleStartTransaction']>
      >(),
      handleStopTransaction: jest.fn<
        ReturnType<OcppTransactionsService['handleStopTransaction']>,
        Parameters<OcppTransactionsService['handleStopTransaction']>
      >(),
    };
    transactionsServiceMock.handleStartTransaction.mockResolvedValue({
      idTagInfo: {
        status: 'Accepted',
      },
      transactionId: 7001,
    });
    transactionsServiceMock.handleStopTransaction.mockResolvedValue({});
    registryService = new OcppRegistryService();
    routingService = new OcppRoutingService(
      registryService,
      connectorsServiceMock as unknown as ConnectorsService,
      broadcastServiceMock as unknown as StationStatusBroadcastService,
      meterValuesServiceMock as unknown as OcppMeterValuesService,
      transactionsServiceMock as unknown as OcppTransactionsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('attaches one handler per routed action plus a wildcard fallback handler', () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);

    routingService.attachClientHandlers(fixture.client);

    expect(fixture.handleMock).toHaveBeenCalledTimes(ROUTED_OCPP_ACTIONS.length + 1);
    ROUTED_OCPP_ACTIONS.forEach((action) => {
      expect(fixture.handleMock).toHaveBeenCalledWith(action, expect.any(Function));
    });
    expect(fixture.handleMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it('returns a valid BootNotification acceptance response and tracks charge point boot status', async () => {
    const now = new Date('2026-02-17T08:10:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    const bootNotificationPayload = {
      chargePointModel: 'Terra 54',
      chargePointVendor: 'ABB',
    };

    const response = await routingService.routeIncomingMessage(
      'CP-001',
      OcppAction.BOOT_NOTIFICATION,
      bootNotificationPayload,
    );

    const bootNotificationResponse = response as OcppBootNotificationResponse;
    const registration = registryService.getChargePoint('CP-001');

    expect(bootNotificationResponse.interval).toBe(300);
    expect(bootNotificationResponse.status).toBe('Accepted');
    expect(bootNotificationResponse.currentTime).toBe('2026-02-17T08:10:00.000Z');
    expect(registration?.heartbeatIntervalSeconds).toBe(300);
    expect(registration?.lastBootNotification).toEqual(bootNotificationPayload);
    expect(registration?.lastBootNotificationAt).toBe('2026-02-17T08:10:00.000Z');
    expect(registration?.registrationStatus).toBe('Accepted');
  });

  it('returns a valid Heartbeat response and tracks the latest heartbeat timestamp', async () => {
    const now = new Date('2026-02-17T08:15:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);

    const response = await routingService.routeIncomingMessage('CP-001', OcppAction.HEARTBEAT, {});
    const heartbeatResponse = response as OcppHeartbeatResponse;
    const registration = registryService.getChargePoint('CP-001');

    expect(heartbeatResponse.currentTime).toBe('2026-02-17T08:15:00.000Z');
    expect(registration?.lastHeartbeatAt).toBe('2026-02-17T08:15:00.000Z');
    expect(registration?.lastSeenAt).toBe('2026-02-17T08:15:00.000Z');
  });

  it('acknowledges StatusNotification and MeterValues messages with empty payloads', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    const meterValuesPayload: OcppMeterValuesRequest = {
      connectorId: 1,
      meterValue: [],
    };

    await expect(
      routingService.routeIncomingMessage('CP-001', OcppAction.STATUS_NOTIFICATION, {
        connectorId: 1,
        errorCode: 'NoError',
        status: 'Charging',
      }),
    ).resolves.toEqual({});
    await expect(
      routingService.routeIncomingMessage('CP-001', OcppAction.METER_VALUES, meterValuesPayload),
    ).resolves.toEqual({});

    expect(connectorsServiceMock.updateConnectorStatusFromOcppNotification).toHaveBeenCalledWith(
      'CP-001',
      1,
      {
        lastStatusUpdate: undefined,
        status: StationStatus.OCCUPIED,
      },
    );
    expect(broadcastServiceMock.broadcastConnectorStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        chargePointId: 'CP-001',
        event: 'connector.status.updated',
        ocppConnectorId: 1,
        ocppStatus: 'Charging',
      }),
    );
    expect(meterValuesServiceMock.ingestMeterValues).toHaveBeenCalledWith(
      'CP-001',
      meterValuesPayload,
    );
  });

  it('acknowledges StatusNotification payloads when connector lookup fails', async () => {
    connectorsServiceMock.updateConnectorStatusFromOcppNotification.mockRejectedValue(
      new NotFoundException('Connector not found'),
    );

    await expect(
      routingService.routeIncomingMessage('CP-404', OcppAction.STATUS_NOTIFICATION, {
        connectorId: 1,
        errorCode: 'NoError',
        status: 'Unavailable',
      }),
    ).resolves.toEqual({});

    expect(broadcastServiceMock.broadcastConnectorStatusUpdate).not.toHaveBeenCalled();
  });

  it('routes StartTransaction and StopTransaction payloads through transaction lifecycle service', async () => {
    const startPayload: OcppStartTransactionRequest = {
      connectorId: 1,
      idTag: '11111111-1111-4111-8111-111111111111',
      meterStart: 12800,
      timestamp: '2026-02-17T12:00:00.000Z',
    };
    const stopPayload: OcppStopTransactionRequest = {
      meterStop: 15200,
      timestamp: '2026-02-17T12:30:00.000Z',
      transactionId: 7001,
    };

    const startResponse = (await routingService.routeIncomingMessage(
      'CP-001',
      OcppAction.START_TRANSACTION,
      startPayload,
    )) as OcppStartTransactionResponse;
    const stopResponse = (await routingService.routeIncomingMessage(
      'CP-001',
      OcppAction.STOP_TRANSACTION,
      stopPayload,
    )) as OcppStopTransactionResponse;

    expect(startResponse).toEqual({
      idTagInfo: {
        status: 'Accepted',
      },
      transactionId: 7001,
    });
    expect(stopResponse).toEqual({});
    expect(transactionsServiceMock.handleStartTransaction).toHaveBeenCalledWith(
      'CP-001',
      startPayload,
    );
    expect(transactionsServiceMock.handleStopTransaction).toHaveBeenCalledWith(
      'CP-001',
      stopPayload,
    );
  });

  it('rejects unsupported OCPP actions via NotImplemented responses', async () => {
    await expect(
      routingService.routeIncomingMessage('CP-001', OcppAction.REMOTE_START_TRANSACTION, {}),
    ).rejects.toBeInstanceOf(Error);
  });
});
