import type {
  Ocpp2AuthorizeRequest,
  Ocpp2AuthorizeResponse,
  Ocpp2BootNotificationRequest,
  Ocpp2BootNotificationResponse,
  Ocpp2ConnectorStatus,
  Ocpp2HeartbeatResponse,
  Ocpp2MeterValuesRequest,
  Ocpp2StatusNotificationRequest,
  Ocpp2TransactionEventRequest,
  Ocpp2TransactionEventResponse,
  OcppBootNotificationRequest,
} from '@lilocharge/shared-types';
import { Ocpp2Action, StationStatus } from '@lilocharge/shared-types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createRPCError } from 'ocpp-rpc';

import { ConnectorsService } from '../connectors/connectors.service';
import { DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS } from './ocpp.constants';
import { OcppRegistryService } from './ocpp.registry.service';
import {
  type ConnectorStatusUpdateEvent,
  StationStatusBroadcastService,
} from './ocpp.status-broadcast.service';
import { Ocpp2TransactionsService } from './ocpp2.transactions.service';
import type { OcppServerClient } from './ocpp.server.types';

type Ocpp2RoutingResponse =
  | Ocpp2AuthorizeResponse
  | Ocpp2BootNotificationResponse
  | Ocpp2HeartbeatResponse
  | Ocpp2TransactionEventResponse
  | Record<string, never>;

/** OCPP 2.0.1 actions currently handled by the central-system router. */
export const ROUTED_OCPP2_ACTIONS = [
  Ocpp2Action.BOOT_NOTIFICATION,
  Ocpp2Action.HEARTBEAT,
  Ocpp2Action.STATUS_NOTIFICATION,
  Ocpp2Action.METER_VALUES,
  Ocpp2Action.AUTHORIZE,
  Ocpp2Action.TRANSACTION_EVENT,
] as const;

type RoutedOcpp2Action = (typeof ROUTED_OCPP2_ACTIONS)[number];

/**
 * Action router for charge points that negotiated the `ocpp2.0.1` subprotocol.
 *
 * The router mirrors the 1.6 {@link OcppRoutingService} structure (per-action handlers plus a
 * NotImplemented wildcard) but speaks the 2.0.1 wire shapes and delegates transaction handling
 * to the TransactionEvent-based {@link Ocpp2TransactionsService}.
 */
@Injectable()
export class Ocpp2RoutingService {
  private readonly logger: Logger = new Logger(Ocpp2RoutingService.name);

  constructor(
    private readonly registryService: OcppRegistryService,
    private readonly connectorsService: ConnectorsService,
    private readonly stationStatusBroadcastService: StationStatusBroadcastService,
    private readonly transactionsService: Ocpp2TransactionsService,
  ) {}

  /** Attaches action-specific and wildcard RPC handlers for one connected 2.0.1 charge point. */
  public attachClientHandlers(client: OcppServerClient): void {
    const chargePointId = resolveChargePointId(client.identity);

    ROUTED_OCPP2_ACTIONS.forEach((action) => {
      client.handle(action, ({ params }) => {
        return this.routeIncomingMessage(chargePointId, action, params);
      });
    });
    client.handle(({ method, params }) => {
      const actionName = typeof method === 'string' ? method : 'UnknownAction';

      return this.routeIncomingMessage(chargePointId, actionName, params);
    });
  }

  /** Routes one inbound OCPP 2.0.1 action payload to its handler and returns the response payload. */
  public async routeIncomingMessage(
    chargePointId: string,
    actionName: string,
    payload: unknown,
  ): Promise<Ocpp2RoutingResponse> {
    const receivedAt = new Date();
    this.registryService.markChargePointSeen(chargePointId, receivedAt);

    if (!isRoutedOcpp2Action(actionName)) {
      throw createNotImplementedError(`Unsupported OCPP 2.0.1 action: ${actionName}`);
    }

    switch (actionName) {
      case Ocpp2Action.BOOT_NOTIFICATION:
        return this.handleBootNotification(
          chargePointId,
          payload as Ocpp2BootNotificationRequest,
          receivedAt,
        );
      case Ocpp2Action.HEARTBEAT:
        return this.handleHeartbeat(chargePointId, receivedAt);
      case Ocpp2Action.STATUS_NOTIFICATION:
        return this.handleStatusNotification(
          chargePointId,
          payload as Ocpp2StatusNotificationRequest,
          receivedAt,
        );
      case Ocpp2Action.METER_VALUES:
        return this.handleMeterValues(chargePointId, payload as Ocpp2MeterValuesRequest);
      case Ocpp2Action.AUTHORIZE:
        return this.handleAuthorize(chargePointId, payload as Ocpp2AuthorizeRequest);
      case Ocpp2Action.TRANSACTION_EVENT:
        return this.handleTransactionEvent(
          chargePointId,
          payload as Ocpp2TransactionEventRequest,
        );
    }
  }

  /** Builds one 2.0.1 BootNotification acceptance response and records boot metadata. */
  private handleBootNotification(
    chargePointId: string,
    payload: Ocpp2BootNotificationRequest,
    receivedAt: Date,
  ): Ocpp2BootNotificationResponse {
    const registrationStatus = 'Accepted';
    this.registryService.markChargePointBooted(
      chargePointId,
      mapChargingStationToBootNotification(payload),
      registrationStatus,
      DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS,
      receivedAt,
    );
    this.logger.log(
      `BootNotification (2.0.1) routed for ${chargePointId} (${payload.chargingStation.vendorName} ${payload.chargingStation.model}, reason ${payload.reason})`,
    );

    return {
      currentTime: receivedAt.toISOString(),
      interval: DEFAULT_BOOT_NOTIFICATION_INTERVAL_SECONDS,
      status: registrationStatus,
    };
  }

  /** Builds one 2.0.1 Heartbeat response carrying central-system server time. */
  private handleHeartbeat(chargePointId: string, heartbeatAt: Date): Ocpp2HeartbeatResponse {
    this.registryService.markChargePointHeartbeat(chargePointId, heartbeatAt);

    return {
      currentTime: heartbeatAt.toISOString(),
    };
  }

  /**
   * Persists 2.0.1 connector status updates through the shared connector-status path.
   *
   * The EVSE id drives connector resolution (2.0.1 EVSE numbering corresponds to the 1.6
   * connector numbering used in stored evseId candidates). Unknown connector references are
   * acknowledged but logged, matching the 1.6 handler's retry-flood protection.
   */
  private async handleStatusNotification(
    chargePointId: string,
    payload: Ocpp2StatusNotificationRequest,
    receivedAt: Date,
  ): Promise<Record<string, never>> {
    const mappedStatus = mapOcpp2ConnectorStatusToStationStatus(payload.connectorStatus);

    try {
      const connector = await this.connectorsService.updateConnectorStatusFromOcppNotification(
        chargePointId,
        payload.evseId,
        {
          lastStatusUpdate: payload.timestamp,
          status: mappedStatus,
        },
      );
      const event: ConnectorStatusUpdateEvent = {
        chargePointId,
        connector,
        event: 'connector.status.updated',
        occurredAt: payload.timestamp ?? receivedAt.toISOString(),
        ocppConnectorId: payload.evseId,
        ocppStatus: payload.connectorStatus,
      };
      this.stationStatusBroadcastService.broadcastConnectorStatusUpdate(event);

      this.logger.log(
        `StatusNotification (2.0.1) routed for ${chargePointId} EVSE ${payload.evseId}/${payload.connectorId}: ${payload.connectorStatus} -> ${mappedStatus}`,
      );
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        this.logger.warn(
          `StatusNotification (2.0.1) ignored for ${chargePointId} EVSE ${payload.evseId}/${payload.connectorId}: ${error.message}`,
        );

        return {};
      }

      throw error;
    }

    return {};
  }

  /**
   * Acknowledges standalone 2.0.1 MeterValues messages without persistence.
   *
   * 2.0.1 MeterValues carries no transaction binding (transactional telemetry travels inside
   * TransactionEvent), so these samples cannot be attributed to a session — mirroring how the
   * 1.6 handler skips non-transactional samples.
   */
  private handleMeterValues(
    chargePointId: string,
    payload: Ocpp2MeterValuesRequest,
  ): Record<string, never> {
    this.logger.log(
      `MeterValues (2.0.1) acknowledged for ${chargePointId} EVSE ${payload.evseId} with ${payload.meterValue.length} entries (non-transactional; not persisted)`,
    );

    return {};
  }

  /** Authorizes one idToken using the shared idTag resolution rules. */
  private async handleAuthorize(
    chargePointId: string,
    payload: Ocpp2AuthorizeRequest,
  ): Promise<Ocpp2AuthorizeResponse> {
    const response = await this.transactionsService.handleAuthorize(chargePointId, payload);
    this.logger.log(
      `Authorize (2.0.1) routed for ${chargePointId} -> ${response.idTokenInfo.status}`,
    );

    return response;
  }

  /** Routes one TransactionEvent payload through the 2.0.1 transaction lifecycle service. */
  private async handleTransactionEvent(
    chargePointId: string,
    payload: Ocpp2TransactionEventRequest,
  ): Promise<Ocpp2TransactionEventResponse> {
    const response = await this.transactionsService.handleTransactionEvent(chargePointId, payload);
    this.logger.log(
      `TransactionEvent (2.0.1) routed for ${chargePointId}: ${payload.eventType} transaction ${payload.transactionInfo.transactionId}`,
    );

    return response;
  }
}

/** Ensures charge point identity values are available before binding message handlers. */
function resolveChargePointId(identity: string | undefined): string {
  const normalizedIdentity = identity?.trim();

  if (normalizedIdentity === undefined || normalizedIdentity.length === 0) {
    throw new Error('Cannot attach OCPP 2.0.1 handlers without a charge point identity');
  }

  return normalizedIdentity;
}

/** Type guard for action names currently routed by the OCPP 2.0.1 router. */
function isRoutedOcpp2Action(actionName: string): actionName is RoutedOcpp2Action {
  return ROUTED_OCPP2_ACTIONS.includes(actionName as RoutedOcpp2Action);
}

/** Creates a typed OCPP NotImplemented RPC error compatible with strict linting rules. */
function createNotImplementedError(message: string): Error {
  return createRPCError('NotImplemented', message) as Error;
}

/**
 * Maps one 2.0.1 chargingStation descriptor onto the registry's 1.6-shaped boot record so both
 * protocol generations share the same registry bookkeeping.
 */
function mapChargingStationToBootNotification(
  payload: Ocpp2BootNotificationRequest,
): OcppBootNotificationRequest {
  return {
    chargePointModel: payload.chargingStation.model,
    chargePointSerialNumber: payload.chargingStation.serialNumber,
    chargePointVendor: payload.chargingStation.vendorName,
    firmwareVersion: payload.chargingStation.firmwareVersion,
  };
}

/** Maps OCPP 2.0.1 connector status values to shared connector availability statuses. */
function mapOcpp2ConnectorStatusToStationStatus(status: Ocpp2ConnectorStatus): StationStatus {
  switch (status) {
    case 'Available':
      return StationStatus.AVAILABLE;
    case 'Unavailable':
      return StationStatus.OFFLINE;
    case 'Faulted':
      return StationStatus.MAINTENANCE;
    case 'Occupied':
    case 'Reserved':
    default:
      return StationStatus.OCCUPIED;
  }
}
