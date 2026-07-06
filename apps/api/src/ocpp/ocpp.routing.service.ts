import type {
  OcppBootNotificationRequest,
  OcppBootNotificationResponse,
  OcppHeartbeatResponse,
  OcppMeterValuesRequest,
  OcppStartTransactionRequest,
  OcppStartTransactionResponse,
  OcppStatusNotificationStatus,
  OcppStatusNotificationRequest,
  OcppStopTransactionRequest,
  OcppStopTransactionResponse,
} from '@lilocharge/shared-types';
import { OcppAction, StationStatus } from '@lilocharge/shared-types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createRPCError } from 'ocpp-rpc';

import { ConnectorsService } from '../connectors/connectors.service';
import { OcppMeterValuesService } from './ocpp.meter-values.service';
import {
  DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS,
  OCPP_AUTHORIZE_ACTION,
} from './ocpp.constants';
import { OcppRegistryService } from './ocpp.registry.service';
import {
  type ConnectorStatusUpdateEvent,
  StationStatusBroadcastService,
} from './ocpp.status-broadcast.service';
import {
  type OcppAuthorizeRequest,
  type OcppAuthorizeResponse,
  OcppTransactionsService,
} from './ocpp.transactions.service';
import type { OcppServerClient } from './ocpp.server.types';

type OcppRoutingResponse =
  | OcppAuthorizeResponse
  | OcppBootNotificationResponse
  | OcppHeartbeatResponse
  | OcppStartTransactionResponse
  | OcppStopTransactionResponse
  | Record<string, never>;

/** OCPP actions currently handled by the central-system router. */
export const ROUTED_OCPP_ACTIONS = [
  OcppAction.BOOT_NOTIFICATION,
  OcppAction.HEARTBEAT,
  OcppAction.STATUS_NOTIFICATION,
  OcppAction.METER_VALUES,
  OCPP_AUTHORIZE_ACTION,
  OcppAction.START_TRANSACTION,
  OcppAction.STOP_TRANSACTION,
] as const;

type RoutedOcppAction = (typeof ROUTED_OCPP_ACTIONS)[number];

/** Action router responsible for binding per-client handlers and dispatching OCPP messages. */
@Injectable()
export class OcppRoutingService {
  private readonly logger: Logger = new Logger(OcppRoutingService.name);

  constructor(
    private readonly registryService: OcppRegistryService,
    private readonly connectorsService: ConnectorsService,
    private readonly stationStatusBroadcastService: StationStatusBroadcastService,
    private readonly meterValuesService: OcppMeterValuesService,
    private readonly transactionsService: OcppTransactionsService,
  ) {}

  /** Attaches action-specific and wildcard RPC handlers for one connected charge point client. */
  public attachClientHandlers(client: OcppServerClient): void {
    const chargePointId = resolveChargePointId(client.identity);

    ROUTED_OCPP_ACTIONS.forEach((action) => {
      client.handle(action, ({ params }) => {
        return this.routeIncomingMessage(chargePointId, action, params);
      });
    });
    client.handle(({ method, params }) => {
      const actionName = typeof method === 'string' ? method : 'UnknownAction';

      return this.routeIncomingMessage(chargePointId, actionName, params);
    });
  }

  /** Routes an inbound OCPP action payload to its scaffold handler and returns an OCPP response payload. */
  public async routeIncomingMessage(
    chargePointId: string,
    actionName: string,
    payload: unknown,
  ): Promise<OcppRoutingResponse> {
    const receivedAt = new Date();
    this.registryService.markChargePointSeen(chargePointId, receivedAt);

    if (!isRoutedOcppAction(actionName)) {
      throw createNotImplementedError(`Unsupported OCPP action: ${actionName}`);
    }

    switch (actionName) {
      case OcppAction.BOOT_NOTIFICATION:
        return this.handleBootNotification(
          chargePointId,
          payload as OcppBootNotificationRequest,
          receivedAt,
        );
      case OcppAction.HEARTBEAT:
        return this.handleHeartbeat(chargePointId, receivedAt);
      case OcppAction.STATUS_NOTIFICATION:
        return this.handleStatusNotification(
          chargePointId,
          payload as OcppStatusNotificationRequest,
          receivedAt,
        );
      case OcppAction.METER_VALUES:
        return this.handleMeterValues(chargePointId, payload as OcppMeterValuesRequest);
      case OCPP_AUTHORIZE_ACTION:
        return this.handleAuthorize(chargePointId, payload as OcppAuthorizeRequest);
      case OcppAction.START_TRANSACTION:
        return this.handleStartTransaction(chargePointId, payload as OcppStartTransactionRequest);
      case OcppAction.STOP_TRANSACTION:
        return this.handleStopTransaction(chargePointId, payload as OcppStopTransactionRequest);
    }
  }

  /** Builds a compliant BootNotification acceptance response for newly connected charge points. */
  private handleBootNotification(
    chargePointId: string,
    payload: OcppBootNotificationRequest,
    receivedAt: Date,
  ): OcppBootNotificationResponse {
    const registrationStatus = 'Accepted';
    this.registryService.markChargePointBooted(
      chargePointId,
      payload,
      registrationStatus,
      DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS,
      receivedAt,
    );
    this.logger.log(
      `BootNotification routed for ${chargePointId} (${payload.chargePointVendor} ${payload.chargePointModel})`,
    );

    return {
      currentTime: receivedAt.toISOString(),
      interval: DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS,
      status: registrationStatus,
    };
  }

  /** Builds a compliant Heartbeat response carrying central-system server time. */
  private handleHeartbeat(chargePointId: string, heartbeatAt: Date): OcppHeartbeatResponse {
    this.registryService.markChargePointHeartbeat(chargePointId, heartbeatAt);

    return {
      currentTime: heartbeatAt.toISOString(),
    };
  }

  /**
   * Persists connector status updates from StatusNotification payloads and broadcasts update events.
   *
   * Unknown connector references are acknowledged but logged, because charge point retries cannot
   * resolve central-system mapping mistakes and would otherwise flood the server with retries.
   */
  private async handleStatusNotification(
    chargePointId: string,
    payload: OcppStatusNotificationRequest,
    receivedAt: Date,
  ): Promise<Record<string, never>> {
    const mappedStatus = mapOcppStatusToStationStatus(payload.status);

    try {
      const connector = await this.connectorsService.updateConnectorStatusFromOcppNotification(
        chargePointId,
        payload.connectorId,
        {
          lastStatusUpdate: payload.timestamp,
          status: mappedStatus,
        },
      );
      const event = buildConnectorStatusUpdateEvent({
        chargePointId,
        connector,
        mappedStatus,
        occurredAt: receivedAt,
        payload,
      });
      this.stationStatusBroadcastService.broadcastConnectorStatusUpdate(event);

      this.logger.log(
        `StatusNotification routed for ${chargePointId} connector ${payload.connectorId}: ${payload.status} -> ${mappedStatus}`,
      );
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        const message = error.message;
        this.logger.warn(
          `StatusNotification ignored for ${chargePointId} connector ${payload.connectorId}: ${message}`,
        );

        return {};
      }

      throw error;
    }

    return {};
  }

  /** Persists one MeterValues payload into TimescaleDB and returns an empty OCPP acknowledgement payload. */
  private async handleMeterValues(
    chargePointId: string,
    payload: OcppMeterValuesRequest,
  ): Promise<Record<string, never>> {
    const insertedCount = await this.meterValuesService.ingestMeterValues(chargePointId, payload);

    this.logger.log(
      `MeterValues routed for ${chargePointId} connector ${payload.connectorId} with ${payload.meterValue.length} entries (${insertedCount} inserted)`,
    );

    return {};
  }

  /** Authorizes one idTag using the same validation rules applied by StartTransaction. */
  private async handleAuthorize(
    chargePointId: string,
    payload: OcppAuthorizeRequest,
  ): Promise<OcppAuthorizeResponse> {
    const response = await this.transactionsService.handleAuthorize(chargePointId, payload);
    this.logger.log(`Authorize routed for ${chargePointId} -> ${response.idTagInfo.status}`);

    return response;
  }

  /** Starts one session from an inbound StartTransaction message and returns a central transaction id. */
  private async handleStartTransaction(
    chargePointId: string,
    payload: OcppStartTransactionRequest,
  ): Promise<OcppStartTransactionResponse> {
    const response = await this.transactionsService.handleStartTransaction(chargePointId, payload);
    this.logger.log(
      `StartTransaction routed for ${chargePointId} connector ${payload.connectorId} -> ${response.idTagInfo.status} (${response.transactionId})`,
    );

    return response;
  }

  /** Completes one session from an inbound StopTransaction message and persists final totals. */
  private async handleStopTransaction(
    chargePointId: string,
    payload: OcppStopTransactionRequest,
  ): Promise<OcppStopTransactionResponse> {
    const response = await this.transactionsService.handleStopTransaction(chargePointId, payload);
    this.logger.log(
      `StopTransaction routed for ${chargePointId} transaction ${payload.transactionId}`,
    );

    return response;
  }
}

/** Ensures charge point identity values are available before binding message handlers. */
function resolveChargePointId(identity: string | undefined): string {
  const normalizedIdentity = identity?.trim();

  if (normalizedIdentity === undefined || normalizedIdentity.length === 0) {
    throw new Error('Cannot attach OCPP handlers without a charge point identity');
  }

  return normalizedIdentity;
}

/** Type guard for action names currently scaffolded by the OCPP router. */
function isRoutedOcppAction(actionName: string): actionName is RoutedOcppAction {
  return ROUTED_OCPP_ACTIONS.includes(actionName as RoutedOcppAction);
}

/** Creates a typed OCPP NotImplemented RPC error compatible with strict linting rules. */
function createNotImplementedError(message: string): Error {
  return createRPCError('NotImplemented', message) as Error;
}

interface BuildConnectorStatusUpdateEventInput {
  readonly chargePointId: string;
  readonly connector: ConnectorStatusUpdateEvent['connector'];
  readonly mappedStatus: StationStatus;
  readonly occurredAt: Date;
  readonly payload: OcppStatusNotificationRequest;
}

/** Creates a websocket broadcast payload for one OCPP connector status update event. */
function buildConnectorStatusUpdateEvent(
  input: BuildConnectorStatusUpdateEventInput,
): ConnectorStatusUpdateEvent {
  return {
    chargePointId: input.chargePointId,
    connector: input.connector,
    event: 'connector.status.updated',
    occurredAt: input.payload.timestamp ?? input.occurredAt.toISOString(),
    ocppConnectorId: input.payload.connectorId,
    ocppStatus: input.payload.status,
  };
}

/** Maps OCPP StatusNotification status values to shared connector availability statuses. */
function mapOcppStatusToStationStatus(status: OcppStatusNotificationStatus): StationStatus {
  switch (status) {
    case 'Available':
      return StationStatus.AVAILABLE;
    case 'Unavailable':
      return StationStatus.OFFLINE;
    case 'Faulted':
      return StationStatus.MAINTENANCE;
    case 'Preparing':
    case 'Charging':
    case 'SuspendedEVSE':
    case 'SuspendedEV':
    case 'Finishing':
    case 'Reserved':
    default:
      return StationStatus.OCCUPIED;
  }
}
