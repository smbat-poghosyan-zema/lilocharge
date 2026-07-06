import { randomUUID } from 'node:crypto';

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
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import { RedisService } from '../redis/redis.service';
import { OcppRegistryService } from './ocpp.registry.service';
import type { OcppRpcCallOptions, OcppServerClient } from './ocpp.server.types';

const DEFAULT_REMOTE_START_MAX_ATTEMPTS = 3;
const DEFAULT_REMOTE_START_RETRY_DELAY_MS = 300;
const DEFAULT_REMOTE_START_TIMEOUT_MS = 10_000;
const DEFAULT_TRANSACTION_TRACKING_TTL_MS = 5 * 60 * 1000;
const MILLISECONDS_PER_SECOND = 1000;

/** Redis key prefix for tracked remote-start correlation records. */
export const OCPP_REMOTE_START_KEY_PREFIX = 'ocpp:remote-start';

const INVALID_CALL_HANDLER_MESSAGE =
  'RemoteStartTransaction cannot be sent because the charge point client is missing a call handler';

/**
 * Minimal key-value contract required for remote-start tracking storage.
 *
 * `RedisService` satisfies this structurally; an in-memory fallback is used when no Redis
 * service is available (for example, in directly constructed unit-test instances).
 */
export interface OcppRemoteStartTrackingStore {
  del(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  scanKeys(pattern: string): Promise<string[]>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<void>;
}

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

/** One persisted record tracking a previously accepted remote-start request. */
export interface OcppTrackedRemoteStartTransaction {
  readonly attemptCount: number;
  readonly chargePointId: string;
  readonly connectorId: number;
  readonly expiresAt: string;
  readonly idTag: string;
  readonly remoteStartRequestId: string;
  readonly requestedAt: string;
  /** Monotonic ordering hint used to pick the newest matching record deterministically. */
  readonly sequence: number;
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

/**
 * Service responsible for outbound OCPP RemoteStartTransaction commands and retry-aware tracking.
 *
 * Tracking records are persisted in Redis (keyed by charge point and request id, with a TTL
 * matching the remote-start correlation timeout) so an API restart does not orphan an in-flight
 * remote start: the StartTransaction handler can still correlate the inbound transaction.
 *
 * Multi-instance limitation: each charge point holds exactly one WebSocket connection to exactly
 * one API replica, and the live client object cannot be shared, so outbound commands must be
 * issued on the replica that owns the connection (the local registry). Only the correlation
 * state — not the connection — is shared through Redis.
 */
@Injectable()
export class OcppRemoteStartService {
  private readonly logger: Logger = new Logger(OcppRemoteStartService.name);
  private readonly trackingStore: OcppRemoteStartTrackingStore;
  private nextSequence: number = Date.now();

  constructor(
    private readonly registryService: OcppRegistryService,
    @Optional() redisService?: RedisService,
  ) {
    this.trackingStore = redisService ?? new InMemoryOcppTrackingStore();

    if (redisService === undefined) {
      this.logger.warn(
        'RedisService unavailable; remote-start tracking falls back to in-memory storage (records are lost on restart)',
      );
    }
  }

  /**
   * Sends one outbound RemoteStartTransaction command with retry/timeout handling.
   *
   * Accepted requests are persisted in Redis so later inbound StartTransaction messages can be
   * linked to their originating remote-start request by connector and idTag, even after restarts.
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

        const trackedRequest = await this.trackAcceptedRemoteStart({
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

  /** Returns one tracked remote-start request by request id, or null when not found or expired. */
  public async getTrackedRemoteStartTransaction(
    remoteStartRequestId: string,
  ): Promise<OcppTrackedRemoteStartTransaction | null> {
    try {
      const keys = await this.trackingStore.scanKeys(
        `${OCPP_REMOTE_START_KEY_PREFIX}:*:${remoteStartRequestId}`,
      );
      const key = keys[0];

      if (key === undefined) {
        return null;
      }

      const record = parseTrackedRecord(await this.trackingStore.get(key));

      if (record === null || isPendingRecordExpired(record, Date.now())) {
        return null;
      }

      return record;
    } catch (error: unknown) {
      this.logger.warn(`Remote-start tracking lookup failed: ${resolveErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Links one inbound OCPP transaction id to the newest pending tracked remote-start request.
   *
   * Matching is scoped to charge point, connector id, and idTag. Returns null when no compatible
   * pending tracking record exists (for example, after TTL expiry). Linked records are retained
   * for another full tracking window so completed correlations remain queryable.
   */
  public async linkTransactionIdToTrackedRemoteStart(
    input: OcppTransactionTrackingLinkInput,
  ): Promise<OcppTrackedRemoteStartTransaction | null> {
    assertTransactionTrackingLinkInput(input);

    try {
      const records = await this.readTrackedRecords(input.chargePointId);
      const nowMs = Date.now();
      const latestPendingRecord =
        records
          .filter((record) => {
            return (
              record.connectorId === input.connectorId &&
              record.idTag === input.idTag &&
              record.transactionId === null &&
              !isPendingRecordExpired(record, nowMs)
            );
          })
          .sort((left, right) => right.sequence - left.sequence)[0] ?? null;

      if (latestPendingRecord === null) {
        return null;
      }

      const updatedRecord: OcppTrackedRemoteStartTransaction = {
        ...latestPendingRecord,
        transactionId: input.transactionId,
        updatedAt: new Date(nowMs).toISOString(),
      };
      await this.persistTrackedRecord(updatedRecord, resolveLinkedRecordTtlSeconds(updatedRecord));

      return updatedRecord;
    } catch (error: unknown) {
      this.logger.warn(`Remote-start tracking link failed: ${resolveErrorMessage(error)}`);
      return null;
    }
  }

  /** Finds one tracked remote-start request by charge point id and linked OCPP transaction id. */
  public async findTrackedRemoteStartTransactionByTransactionId(
    chargePointId: string,
    transactionId: number,
  ): Promise<OcppTrackedRemoteStartTransaction | null> {
    try {
      const records = await this.readTrackedRecords(chargePointId);

      return (
        records
          .filter((record) => record.transactionId === transactionId)
          .sort((left, right) => right.sequence - left.sequence)[0] ?? null
      );
    } catch (error: unknown) {
      this.logger.warn(`Remote-start tracking search failed: ${resolveErrorMessage(error)}`);
      return null;
    }
  }

  /** Stores one accepted remote-start request for later inbound transaction-id linking. */
  private async trackAcceptedRemoteStart(input: {
    readonly attemptCount: number;
    readonly chargePointId: string;
    readonly payload: OcppRemoteStartTransactionRequest;
    readonly trackingTtlMs: number;
  }): Promise<OcppTrackedRemoteStartTransaction> {
    const now = new Date();
    const trackedRecord: OcppTrackedRemoteStartTransaction = {
      attemptCount: input.attemptCount,
      chargePointId: input.chargePointId,
      connectorId: input.payload.connectorId,
      expiresAt: new Date(now.getTime() + input.trackingTtlMs).toISOString(),
      idTag: input.payload.idTag,
      remoteStartRequestId: randomUUID(),
      requestedAt: now.toISOString(),
      sequence: this.allocateSequence(),
      transactionId: null,
      updatedAt: now.toISOString(),
    };

    try {
      await this.persistTrackedRecord(
        trackedRecord,
        millisecondsToTtlSeconds(input.trackingTtlMs),
      );
    } catch (error: unknown) {
      // Tracking is best-effort correlation metadata; a storage outage must not fail an
      // already-accepted remote start.
      this.logger.error(`Remote-start tracking persist failed: ${resolveErrorMessage(error)}`);
    }

    return trackedRecord;
  }

  /** Persists one tracked record under its charge-point-scoped Redis key with the given TTL. */
  private async persistTrackedRecord(
    record: OcppTrackedRemoteStartTransaction,
    ttlSeconds: number,
  ): Promise<void> {
    await this.trackingStore.setEx(
      buildTrackingKey(record.chargePointId, record.remoteStartRequestId),
      ttlSeconds,
      JSON.stringify(record),
    );
  }

  /** Reads all tracked remote-start records currently stored for one charge point. */
  private async readTrackedRecords(
    chargePointId: string,
  ): Promise<OcppTrackedRemoteStartTransaction[]> {
    const keys = await this.trackingStore.scanKeys(
      `${OCPP_REMOTE_START_KEY_PREFIX}:${encodeChargePointId(chargePointId)}:*`,
    );
    const rawRecords = await Promise.all(keys.map((key) => this.trackingStore.get(key)));

    return rawRecords
      .map((rawRecord) => parseTrackedRecord(rawRecord))
      .filter((record): record is OcppTrackedRemoteStartTransaction => record !== null);
  }

  /** Allocates one monotonically increasing sequence value for record ordering. */
  private allocateSequence(): number {
    this.nextSequence += 1;

    return this.nextSequence;
  }
}

/** In-memory tracking store used when Redis is unavailable (unit tests, degraded startup). */
class InMemoryOcppTrackingStore implements OcppRemoteStartTrackingStore {
  private readonly entries: Map<string, { expiresAtMs: number; value: string }> = new Map();

  /** Deletes one stored entry by key. */
  public del(key: string): Promise<void> {
    this.entries.delete(key);

    return Promise.resolve();
  }

  /** Returns one stored value by key, honouring entry TTLs. */
  public get(key: string): Promise<string | null> {
    this.pruneExpiredEntries();

    return Promise.resolve(this.entries.get(key)?.value ?? null);
  }

  /** Returns all stored keys matching one Redis-style glob pattern. */
  public scanKeys(pattern: string): Promise<string[]> {
    this.pruneExpiredEntries();
    const matcher = buildGlobMatcher(pattern);

    return Promise.resolve([...this.entries.keys()].filter((key) => matcher.test(key)));
  }

  /** Stores one value with a TTL in seconds. */
  public setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.entries.set(key, {
      expiresAtMs: Date.now() + ttlSeconds * MILLISECONDS_PER_SECOND,
      value,
    });

    return Promise.resolve();
  }

  /** Removes entries whose TTL has elapsed. */
  private pruneExpiredEntries(): void {
    const nowMs = Date.now();

    this.entries.forEach((entry, key) => {
      if (entry.expiresAtMs <= nowMs) {
        this.entries.delete(key);
      }
    });
  }
}

/** Builds one anchored regular expression matching Redis-style `*` glob patterns. */
function buildGlobMatcher(pattern: string): RegExp {
  const escapedPattern = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${escapedPattern}$`);
}

/** Builds the Redis key for one tracked remote-start record. */
function buildTrackingKey(chargePointId: string, remoteStartRequestId: string): string {
  return `${OCPP_REMOTE_START_KEY_PREFIX}:${encodeChargePointId(chargePointId)}:${remoteStartRequestId}`;
}

/** Encodes charge point identities so separator and glob characters cannot corrupt Redis keys. */
function encodeChargePointId(chargePointId: string): string {
  return encodeURIComponent(chargePointId);
}

/** Converts one millisecond TTL to a whole-second Redis TTL (minimum one second). */
function millisecondsToTtlSeconds(ttlMs: number): number {
  return Math.max(1, Math.ceil(ttlMs / MILLISECONDS_PER_SECOND));
}

/** Resolves the retention TTL for one linked record (one full tracking window from link time). */
function resolveLinkedRecordTtlSeconds(record: OcppTrackedRemoteStartTransaction): number {
  const trackingWindowMs = Date.parse(record.expiresAt) - Date.parse(record.requestedAt);

  if (!Number.isFinite(trackingWindowMs) || trackingWindowMs <= 0) {
    return millisecondsToTtlSeconds(DEFAULT_TRANSACTION_TRACKING_TTL_MS);
  }

  return millisecondsToTtlSeconds(trackingWindowMs);
}

/** Determines whether one pending (unlinked) record has passed its correlation deadline. */
function isPendingRecordExpired(record: OcppTrackedRemoteStartTransaction, nowMs: number): boolean {
  if (record.transactionId !== null) {
    return false;
  }

  const expiresAtMs = Date.parse(record.expiresAt);

  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

/** Parses one raw stored JSON payload into a tracked remote-start record, or null when invalid. */
function parseTrackedRecord(rawRecord: string | null): OcppTrackedRemoteStartTransaction | null {
  if (rawRecord === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRecord);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const record = parsed as Partial<OcppTrackedRemoteStartTransaction>;
  const hasValidShape =
    typeof record.chargePointId === 'string' &&
    typeof record.connectorId === 'number' &&
    typeof record.expiresAt === 'string' &&
    typeof record.idTag === 'string' &&
    typeof record.remoteStartRequestId === 'string' &&
    typeof record.requestedAt === 'string' &&
    typeof record.updatedAt === 'string' &&
    typeof record.attemptCount === 'number' &&
    typeof record.sequence === 'number' &&
    (record.transactionId === null || typeof record.transactionId === 'number');

  if (!hasValidShape) {
    return null;
  }

  return record as OcppTrackedRemoteStartTransaction;
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
