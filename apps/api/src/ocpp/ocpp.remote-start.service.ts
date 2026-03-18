import type {
  OcppRemoteStartTransactionRequest,
  OcppRemoteStartTransactionResponse,
  OcppRemoteStartTransactionResponseStatus,
} from '@lilocharge/shared-types';
import { OcppAction } from '@lilocharge/shared-types';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { OcppRegistryService } from './ocpp.registry.service';
import type { OcppRpcCallOptions, OcppServerClient } from './ocpp.server.types';

const DEFAULT_REMOTE_START_MAX_ATTEMPTS = 3;
const DEFAULT_REMOTE_START_RETRY_DELAY_MS = 300;
const DEFAULT_REMOTE_START_TIMEOUT_MS = 10_000;
const DEFAULT_TRANSACTION_TRACKING_TTL_MS = 5 * 60 * 1000;

const INVALID_CALL_HANDLER_MESSAGE =
  'RemoteStartTransaction cannot be sent because the charge point client is missing a call handler';

/** Input payload used to dispatch one outbound OCPP RemoteStartTransaction command. */
export interface OcppRemoteStartCommand {
  readonly chargePointId: string;
  readonly maxAttempts?: number;
  readonly payload: OcppRemoteStartTransactionRequest;
  readonly retryDelayMs?: number;
  readonly timeoutMs?: number;
  readonly trackingTtlMs?: number;
}

/** Result metadata returned after executing one outbound RemoteStartTransaction command flow. */
export interface OcppRemoteStartResult {
  readonly attemptCount: number;
  readonly chargePointId: string;
  readonly status: OcppRemoteStartTransactionResponseStatus;
  readonly trackingId: string | null;
}

/** One in-memory record tracking a previously accepted remote-start request. */
export interface OcppTrackedRemoteStartTransaction {
  readonly attemptCount: number;
  readonly chargePointId: string;
  readonly connectorId: number;
  readonly expiresAt: string;
  readonly idTag: string;
  readonly remoteStartRequestId: string;
  readonly requestedAt: string;
  readonly transactionId: number | null;
  readonly updatedAt: string;
}

/** Input used to link an inbound OCPP transaction id to a tracked remote-start request. */
export interface OcppTransactionTrackingLinkInput {
  readonly chargePointId: string;
  readonly connectorId: number;
  readonly idTag: string;
  readonly transactionId: number;
}

/** Service responsible for outbound OCPP RemoteStartTransaction commands and retry-aware tracking. */
@Injectable()
export class OcppRemoteStartService {
  private readonly logger: Logger = new Logger(OcppRemoteStartService.name);
  private readonly trackedRemoteStarts: Map<string, OcppTrackedRemoteStartTransaction> = new Map();

  constructor(private readonly registryService: OcppRegistryService) {}

  /**
   * Sends one outbound RemoteStartTransaction command with retry/timeout handling.
   *
   * Accepted requests are persisted in-memory so later inbound StartTransaction messages can be
   * linked to their originating remote-start request by connector and idTag.
   */
  public async remoteStartTransaction(
    command: OcppRemoteStartCommand,
  ): Promise<OcppRemoteStartResult> {
    assertRemoteStartPayload(command.payload);
    const registration = this.registryService.getChargePoint(command.chargePointId);

    if (registration === null) {
      throw new NotFoundException(`Charge point ${command.chargePointId} is not connected`);
    }

    const client = registration.client;
    const call = resolveClientCall(client);
    const maxAttempts = resolvePositiveInteger(
      command.maxAttempts,
      DEFAULT_REMOTE_START_MAX_ATTEMPTS,
      'maxAttempts',
    );
    const retryDelayMs = resolveNonNegativeInteger(
      command.retryDelayMs,
      DEFAULT_REMOTE_START_RETRY_DELAY_MS,
      'retryDelayMs',
    );
    const timeoutMs = resolvePositiveInteger(
      command.timeoutMs,
      DEFAULT_REMOTE_START_TIMEOUT_MS,
      'timeoutMs',
    );
    const trackingTtlMs = resolvePositiveInteger(
      command.trackingTtlMs,
      DEFAULT_TRANSACTION_TRACKING_TTL_MS,
      'trackingTtlMs',
    );
    let lastError: unknown;

    for (let attemptCount = 1; attemptCount <= maxAttempts; attemptCount += 1) {
      try {
        const response = await call<OcppRemoteStartTransactionResponse>(
          OcppAction.REMOTE_START_TRANSACTION,
          command.payload,
          {
            callTimeoutMs: timeoutMs,
          },
        );
        const remoteStartResponse = parseRemoteStartResponse(response);

        if (remoteStartResponse === null) {
          throw new Error('Charge point returned an invalid RemoteStartTransaction response');
        }

        if (remoteStartResponse.status === 'Rejected') {
          return {
            attemptCount,
            chargePointId: command.chargePointId,
            status: 'Rejected',
            trackingId: null,
          };
        }

        const trackedRequest = this.trackAcceptedRemoteStart({
          attemptCount,
          chargePointId: command.chargePointId,
          payload: command.payload,
          trackingTtlMs,
        });

        return {
          attemptCount,
          chargePointId: command.chargePointId,
          status: 'Accepted',
          trackingId: trackedRequest.remoteStartRequestId,
        };
      } catch (error: unknown) {
        lastError = error;
        const message = resolveErrorMessage(error);
        this.logger.warn(
          `RemoteStartTransaction attempt ${attemptCount}/${maxAttempts} failed for ${command.chargePointId} connector ${command.payload.connectorId}: ${message}`,
        );

        if (attemptCount === maxAttempts) {
          break;
        }

        await sleep(retryDelayMs);
      }
    }

    throw new ServiceUnavailableException(
      `RemoteStartTransaction failed for ${command.chargePointId} connector ${command.payload.connectorId}: ${resolveErrorMessage(lastError)}`,
    );
  }

  /** Returns one tracked remote-start request by request id, or null when not found. */
  public getTrackedRemoteStartTransaction(
    remoteStartRequestId: string,
  ): OcppTrackedRemoteStartTransaction | null {
    this.pruneExpiredPendingRecords();

    return this.trackedRemoteStarts.get(remoteStartRequestId) ?? null;
  }

  /**
   * Links one inbound OCPP transaction id to the newest pending tracked remote-start request.
   *
   * Matching is scoped to charge point, connector id, and idTag. Returns null when no compatible
   * pending tracking record exists (for example, after TTL expiry).
   */
  public linkTransactionIdToTrackedRemoteStart(
    input: OcppTransactionTrackingLinkInput,
  ): OcppTrackedRemoteStartTransaction | null {
    assertTransactionTrackingLinkInput(input);
    this.pruneExpiredPendingRecords();

    const latestPendingRecord = this.findLatestPendingTrackedRecord(input);

    if (latestPendingRecord === null) {
      return null;
    }

    const updatedAt = new Date().toISOString();
    const updatedRecord: OcppTrackedRemoteStartTransaction = {
      ...latestPendingRecord,
      transactionId: input.transactionId,
      updatedAt,
    };
    this.trackedRemoteStarts.set(updatedRecord.remoteStartRequestId, updatedRecord);

    return updatedRecord;
  }

  /** Finds one tracked remote-start request by charge point id and linked OCPP transaction id. */
  public findTrackedRemoteStartTransactionByTransactionId(
    chargePointId: string,
    transactionId: number,
  ): OcppTrackedRemoteStartTransaction | null {
    this.pruneExpiredPendingRecords();

    const matchingRecords = [...this.trackedRemoteStarts.values()]
      .filter((record) => {
        return record.chargePointId === chargePointId && record.transactionId === transactionId;
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return matchingRecords[0] ?? null;
  }

  /** Stores one accepted remote-start request for later inbound transaction-id linking. */
  private trackAcceptedRemoteStart(input: {
    readonly attemptCount: number;
    readonly chargePointId: string;
    readonly payload: OcppRemoteStartTransactionRequest;
    readonly trackingTtlMs: number;
  }): OcppTrackedRemoteStartTransaction {
    this.pruneExpiredPendingRecords();

    const now = new Date();
    const trackedRecord: OcppTrackedRemoteStartTransaction = {
      attemptCount: input.attemptCount,
      chargePointId: input.chargePointId,
      connectorId: input.payload.connectorId,
      expiresAt: new Date(now.getTime() + input.trackingTtlMs).toISOString(),
      idTag: input.payload.idTag,
      remoteStartRequestId: randomUUID(),
      requestedAt: now.toISOString(),
      transactionId: null,
      updatedAt: now.toISOString(),
    };
    this.trackedRemoteStarts.set(trackedRecord.remoteStartRequestId, trackedRecord);

    return trackedRecord;
  }

  /** Returns the newest compatible pending tracked record for one transaction-link operation. */
  private findLatestPendingTrackedRecord(
    input: OcppTransactionTrackingLinkInput,
  ): OcppTrackedRemoteStartTransaction | null {
    const recordsNewestFirst = [...this.trackedRemoteStarts.values()].reverse();

    return (
      recordsNewestFirst.find((record) => {
        return (
          record.chargePointId === input.chargePointId &&
          record.connectorId === input.connectorId &&
          record.idTag === input.idTag &&
          record.transactionId === null
        );
      }) ?? null
    );
  }

  /** Removes expired records that never received a transaction id link. */
  private pruneExpiredPendingRecords(now: Date = new Date()): void {
    const nowMs = now.getTime();

    this.trackedRemoteStarts.forEach((record, remoteStartRequestId) => {
      if (record.transactionId !== null) {
        return;
      }

      const expiresAtMs = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) {
        return;
      }

      this.trackedRemoteStarts.delete(remoteStartRequestId);
    });
  }
}

/** Validates one RemoteStartTransaction request payload before dispatching outbound RPC calls. */
function assertRemoteStartPayload(payload: OcppRemoteStartTransactionRequest): void {
  if (!Number.isInteger(payload.connectorId) || payload.connectorId <= 0) {
    throw new BadRequestException('RemoteStartTransaction connectorId must be a positive integer');
  }

  if (payload.idTag.trim().length === 0) {
    throw new BadRequestException('RemoteStartTransaction idTag is required');
  }
}

/** Validates one transaction-link input before associating remote-start records with transaction ids. */
function assertTransactionTrackingLinkInput(input: OcppTransactionTrackingLinkInput): void {
  if (!Number.isInteger(input.connectorId) || input.connectorId <= 0) {
    throw new BadRequestException('connectorId must be a positive integer');
  }

  if (input.idTag.trim().length === 0) {
    throw new BadRequestException('idTag is required');
  }

  if (!Number.isInteger(input.transactionId) || input.transactionId <= 0) {
    throw new BadRequestException('transactionId must be a positive integer');
  }
}

/** Resolves and validates one positive-integer option value with fallback defaults. */
function resolvePositiveInteger(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return value;
}

/** Resolves and validates one non-negative integer option value with fallback defaults. */
function resolveNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

/** Resolves an outbound OCPP client call function from one charge-point client instance. */
function resolveClientCall(
  client: OcppServerClient,
): <TResponse>(
  method: string,
  params?: unknown,
  options?: OcppRpcCallOptions,
) => Promise<TResponse> {
  if (client.call === undefined) {
    throw new ServiceUnavailableException(INVALID_CALL_HANDLER_MESSAGE);
  }

  return <TResponse>(
    method: string,
    params?: unknown,
    options?: OcppRpcCallOptions,
  ): Promise<TResponse> => {
    return client.call?.(method, params, options) as Promise<TResponse>;
  };
}

/** Parses one raw outbound RemoteStartTransaction response payload into a typed response object. */
function parseRemoteStartResponse(payload: unknown): OcppRemoteStartTransactionResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const response = payload as { readonly status?: unknown };

  if (response.status !== 'Accepted' && response.status !== 'Rejected') {
    return null;
  }

  return {
    status: response.status,
  };
}

/** Resolves a safe log/error message from an unknown thrown value. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown remote-start error';
}

/** Waits for one retry interval in milliseconds. */
async function sleep(delayMs: number): Promise<void> {
  if (delayMs === 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
