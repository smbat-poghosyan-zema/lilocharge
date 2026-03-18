import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import {
  type ConnectorStatusWebSocketClient,
  StationStatusBroadcastService,
} from './ocpp.status-broadcast.service';

/** Builds a connector-status event fixture for websocket broadcast tests. */
function buildStatusUpdateEvent(): {
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
} {
  return {
    chargePointId: 'ev-armenia-001',
    connector: {
      connectorType: ConnectorType.CCS,
      createdAt: '2026-02-17T08:00:00.000Z',
      evseId: 'ev-armenia-001-evse-1',
      id: '44444444-4444-4444-4444-444444444444',
      lastStatusUpdate: '2026-02-17T08:11:00.000Z',
      powerKw: 120,
      stationId: '33333333-3333-3333-3333-333333333333',
      status: StationStatus.AVAILABLE,
      updatedAt: '2026-02-17T08:11:00.000Z',
    },
    event: 'connector.status.updated',
    occurredAt: '2026-02-17T08:11:00.000Z',
    ocppConnectorId: 1,
    ocppStatus: 'Available',
  };
}

describe('StationStatusBroadcastService', () => {
  it('registers and unregisters websocket clients', () => {
    const service = new StationStatusBroadcastService();
    const client: ConnectorStatusWebSocketClient = {
      send: jest.fn<void, [string]>(),
    };

    service.registerClient(client);
    expect(service.countClients()).toBe(1);

    service.unregisterClient(client);
    expect(service.countClients()).toBe(0);
  });

  it('broadcasts connector status updates to all registered clients', () => {
    const service = new StationStatusBroadcastService();
    const firstClient = {
      send: jest.fn<void, [string]>(),
    };
    const secondClient = {
      send: jest.fn<void, [string]>(),
    };
    const event = buildStatusUpdateEvent();

    service.registerClient(firstClient);
    service.registerClient(secondClient);
    service.broadcastConnectorStatusUpdate(event);

    expect(firstClient.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(secondClient.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it('removes clients that fail during broadcast send', () => {
    const service = new StationStatusBroadcastService();
    const failingClient = {
      send: jest.fn<void, [string]>().mockImplementation(() => {
        throw new Error('Socket closed');
      }),
    };
    const healthyClient = {
      send: jest.fn<void, [string]>(),
    };

    service.registerClient(failingClient);
    service.registerClient(healthyClient);
    service.broadcastConnectorStatusUpdate(buildStatusUpdateEvent());

    expect(service.countClients()).toBe(1);
    expect(healthyClient.send).toHaveBeenCalledTimes(1);
  });
});
