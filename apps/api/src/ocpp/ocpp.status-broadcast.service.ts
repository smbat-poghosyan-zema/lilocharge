import type { StationConnectorResponse } from '@lilocharge/shared-types';
import { Injectable, Logger } from '@nestjs/common';

/** Lightweight websocket client contract used for connector status broadcasts. */
export interface ConnectorStatusWebSocketClient {
  send(message: string): void;
}

/** Event payload broadcast to websocket clients when one connector status changes. */
export interface ConnectorStatusUpdateEvent {
  readonly chargePointId: string;
  readonly connector: StationConnectorResponse;
  readonly event: 'connector.status.updated';
  readonly occurredAt: string;
  readonly ocppConnectorId: number;
  readonly ocppStatus: string;
}

/** Broadcast service used by OCPP handlers to fan out connector status updates to websocket clients. */
@Injectable()
export class StationStatusBroadcastService {
  private readonly clients: Set<ConnectorStatusWebSocketClient> = new Set();
  private readonly logger: Logger = new Logger(StationStatusBroadcastService.name);

  /** Registers one websocket client to receive connector status updates. */
  public registerClient(client: ConnectorStatusWebSocketClient): void {
    this.clients.add(client);
  }

  /** Unregisters one websocket client from connector status updates. */
  public unregisterClient(client: ConnectorStatusWebSocketClient): void {
    this.clients.delete(client);
  }

  /** Returns current count of subscribed websocket clients. */
  public countClients(): number {
    return this.clients.size;
  }

  /** Broadcasts one connector status update payload to all registered websocket clients. */
  public broadcastConnectorStatusUpdate(event: ConnectorStatusUpdateEvent): void {
    const serializedPayload = JSON.stringify(event);

    this.clients.forEach((client) => {
      try {
        client.send(serializedPayload);
      } catch (error: unknown) {
        this.unregisterClient(client);

        const message = error instanceof Error ? error.message : 'Unknown websocket send error';
        this.logger.warn(`Removed websocket client after failed status broadcast send: ${message}`);
      }
    });
  }
}
