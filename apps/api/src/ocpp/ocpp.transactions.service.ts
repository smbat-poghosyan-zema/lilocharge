import type {
  OcppStartTransactionRequest,
  OcppStartTransactionResponse,
  OcppStopTransactionRequest,
  OcppStopTransactionResponse,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionCostCalculatorService } from '../sessions/session-cost-calculator.service';
import { SessionSettlementService } from '../sessions/session-settlement.service';
import { OcppIdTagService } from './ocpp.id-tag.service';
import { buildEpochSecondsSeed, OcppIdAllocator } from './ocpp.id-allocator';
import { OcppRemoteStartService } from './ocpp.remote-start.service';

const OCPP_CONNECTOR_LOOKUP_SELECT = {
  id: true,
} satisfies Prisma.ConnectorSelect;

const USER_LOOKUP_SELECT = {
  id: true,
} satisfies Prisma.UserSelect;

const SESSION_STOP_LOOKUP_SELECT = {
  connectorId: true,
  createdAt: true,
  id: true,
  meterStart: true,
  startTime: true,
  status: true,
  userId: true,
} satisfies Prisma.SessionSelect;

const WATT_HOURS_PER_KILOWATT_HOUR = 1000;
const WATTS_PER_KILOWATT = 1000;

/** Redis counter key for cross-replica OCPP 1.6 transaction-id allocation. */
export const OCPP_TRANSACTION_ID_SEQUENCE_KEY = 'ocpp:txid:seq';

/**
 * Session lifecycle states that make a connector unavailable for a new session (must stay in
 * sync with the API-side guard in sessions.service.ts).
 */
const CONNECTOR_BLOCKING_SESSION_STATUSES: readonly SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.AUTHORIZED,
  SessionStatus.ACTIVE,
];

/** Terminal states an API session can no longer be attached to by an inbound transaction. */
const TERMINAL_SESSION_STATUSES: readonly SessionStatus[] = [
  SessionStatus.COMPLETED,
  SessionStatus.FAILED,
  SessionStatus.CANCELLED,
];

/** Session lookup record shared by OCPP finalization flows (1.6 StopTransaction, 2.0.1 Ended). */
export type OcppSessionLookupRecord = Prisma.SessionGetPayload<{
  select: typeof SESSION_STOP_LOOKUP_SELECT;
}>;

/** Input used to create one ACTIVE session from a charge-point-initiated OCPP transaction start. */
export interface OcppActiveSessionCreateInput {
  readonly connectorId: string;
  readonly meterStartWh: number | null;
  readonly startedAt: Date;
  readonly transactionId: string;
  readonly userId: string;
}

/** Input used to attach one inbound OCPP transaction to the API session that requested it. */
export interface OcppTransactionAttachInput {
  readonly chargePointId: string;
  readonly idTag: string;
  readonly meterStartWh: number | null;
  /** OCPP-side connector/EVSE number the transaction started on (matches the dispatched command). */
  readonly ocppConnectorId: number;
  readonly startedAt: Date;
  /** 1.6 integer transaction id or 2.0.1 station-assigned string transaction id. */
  readonly transactionId: number | string;
}

/** OCPP 1.6-J Authorize request payload (not yet present in shared types). */
export interface OcppAuthorizeRequest {
  readonly idTag: string;
}

/** OCPP 1.6-J Authorize response payload. */
export interface OcppAuthorizeResponse {
  readonly idTagInfo: {
    readonly status: 'Accepted' | 'Invalid';
  };
}

interface MeterValueEnergyAggregate {
  readonly _max: {
    readonly energyActiveImport: number | null;
    readonly powerActiveImport: number | null;
  };
  readonly _min: {
    readonly energyActiveImport: number | null;
  };
}

/** Service implementing inbound OCPP StartTransaction and StopTransaction session lifecycle updates. */
@Injectable()
export class OcppTransactionsService {
  private readonly logger: Logger = new Logger(OcppTransactionsService.name);
  private readonly transactionIdAllocator: OcppIdAllocator;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionCostCalculatorService: SessionCostCalculatorService,
    private readonly sessionSettlementService: SessionSettlementService,
    private readonly notificationsService: NotificationsService,
    private readonly remoteStartService: OcppRemoteStartService,
    private readonly idTagService: OcppIdTagService,
    @Optional() redisService?: RedisService,
  ) {
    this.transactionIdAllocator = new OcppIdAllocator(
      OCPP_TRANSACTION_ID_SEQUENCE_KEY,
      buildEpochSecondsSeed(),
      redisService,
      (error: unknown) => {
        this.logger.warn(
          `Redis transaction-id allocation failed; falling back to in-memory counter: ${resolveErrorMessage(error)}`,
        );
      },
    );

    if (redisService === undefined) {
      const message =
        'RedisService unavailable; OCPP transaction-id allocation falls back to an in-memory ' +
        'counter that can collide across replicas';

      if (process.env.NODE_ENV === 'production') {
        this.logger.error(message);
      } else {
        this.logger.warn(message);
      }
    }
  }

  /**
   * Handles one inbound OCPP StartTransaction payload.
   *
   * When the transaction answers a tracked RemoteStartTransaction dispatched for an API session,
   * the allocated transaction id is ATTACHED to that session (no duplicate row is created), so
   * meter values, RemoteStop, and billing all target the session the user is paying for. Only
   * genuinely charger-local starts create a fresh session, and those go through the
   * one-session-per-connector guard (ConcurrentTx when the connector is already held).
   */
  public async handleStartTransaction(
    chargePointId: string,
    payload: OcppStartTransactionRequest,
  ): Promise<OcppStartTransactionResponse> {
    assertStartTransactionPayload(payload);
    const startedAt = parseIsoTimestamp(payload.timestamp, 'StartTransaction timestamp');
    const connectorId = await this.resolveConnectorId(chargePointId, payload.connectorId);

    if (connectorId === null) {
      this.logger.warn(
        `StartTransaction rejected for ${chargePointId} connector ${payload.connectorId}: connector not found`,
      );

      return buildInvalidStartTransactionResponse();
    }

    const userId = await this.resolveUserId(payload.idTag);
    if (userId === null) {
      this.logger.warn(
        `StartTransaction rejected for ${chargePointId} connector ${payload.connectorId}: user not found for idTag`,
      );

      return buildInvalidStartTransactionResponse();
    }

    const transactionId = await this.allocateTransactionId();
    const attachedSession = await this.attachTransactionToTrackedRemoteStart({
      chargePointId,
      idTag: payload.idTag,
      meterStartWh: payload.meterStart,
      ocppConnectorId: payload.connectorId,
      startedAt,
      transactionId,
    });

    if (attachedSession !== null) {
      return {
        idTagInfo: {
          status: 'Accepted',
        },
        transactionId,
      };
    }

    const createdSession = await this.createActiveOcppSession({
      connectorId,
      meterStartWh: payload.meterStart,
      startedAt,
      transactionId: String(transactionId),
      userId,
    });

    if (createdSession === null) {
      this.logger.warn(
        `StartTransaction rejected for ${chargePointId} connector ${payload.connectorId}: connector already has a blocking session (ConcurrentTx)`,
      );

      return {
        idTagInfo: {
          status: 'ConcurrentTx',
        },
        transactionId: 0,
      };
    }

    return {
      idTagInfo: {
        status: 'Accepted',
      },
      transactionId,
    };
  }

  /**
   * Handles one inbound OCPP Authorize payload.
   *
   * The idTag is validated with the same rules StartTransaction applies (UUID-shaped tag that
   * resolves to an existing user), so pre-charge authorization and transaction start agree.
   */
  public async handleAuthorize(
    chargePointId: string,
    payload: OcppAuthorizeRequest,
  ): Promise<OcppAuthorizeResponse> {
    assertAuthorizePayload(payload);
    const userId = await this.resolveUserId(payload.idTag);

    if (userId === null) {
      this.logger.warn(`Authorize rejected for ${chargePointId}: user not found for idTag`);

      return {
        idTagInfo: {
          status: 'Invalid',
        },
      };
    }

    return {
      idTagInfo: {
        status: 'Accepted',
      },
    };
  }

  /**
   * Handles one inbound OCPP StopTransaction payload.
   *
   * This finalizes the matching active session by computing energy/peak metrics from ingested
   * meter values, calculating tariff cost, and persisting completed session totals.
   */
  public async handleStopTransaction(
    chargePointId: string,
    payload: OcppStopTransactionRequest,
  ): Promise<OcppStopTransactionResponse> {
    assertStopTransactionPayload(payload);
    const stoppedAt = parseIsoTimestamp(payload.timestamp, 'StopTransaction timestamp');
    const session = await this.findSessionByTransactionId(
      chargePointId,
      String(payload.transactionId),
    );

    if (session === null) {
      this.logger.warn(
        `StopTransaction ignored for ${chargePointId} transaction ${payload.transactionId}: session not found`,
      );

      return {};
    }

    if (session.status === SessionStatus.COMPLETED) {
      return {};
    }

    await this.finalizeStoppedSession(session, stoppedAt, payload.meterStop);

    return {};
  }

  /**
   * Finalizes one ACTIVE session stopped by a charge point and returns the final cost in AMD.
   *
   * Shared by 1.6 StopTransaction and 2.0.1 TransactionEvent(Ended): computes energy/peak
   * metrics, calculates tariff cost, persists completed session totals, sends the completion
   * notification, and settles the payment through the shared settlement service (gateway
   * capture, wallet deduction, or zero-energy refund — identical to the API stop path).
   */
  public async finalizeStoppedSession(
    session: OcppSessionLookupRecord,
    stoppedAt: Date,
    meterStopWh: number | null,
  ): Promise<number> {
    const meterStats = await this.prismaService.meterValue.aggregate({
      where: {
        sessionId: session.id,
      },
      _max: {
        energyActiveImport: true,
        powerActiveImport: true,
      },
      _min: {
        energyActiveImport: true,
      },
    });
    // The charger's meterStop - meterStart register delta is the authoritative energy figure
    // (OCPP 1.6 5.12/5.13; OCPP 2.0.1 Transaction.Begin/Transaction.End register samples);
    // sampled meter values are only a fallback because sparse sampling (or a single sample)
    // under-counts the delta and under-bills the session.
    const energyDeliveredKwh =
      calculateEnergyDeliveredFromRegisters(session.meterStart, meterStopWh) ??
      calculateEnergyDeliveredKwh(meterStats);
    const peakPowerKw = calculatePeakPowerKw(meterStats);
    const computedTotalCost = await this.calculateFinalCost({
      connectorId: session.connectorId,
      energyDeliveredKwh,
      sessionId: session.id,
      startedAt: session.startTime ?? session.createdAt,
      stoppedAt,
    });
    const settlementDecision = await this.sessionSettlementService.resolveSettlement({
      billableEnergyKwh: energyDeliveredKwh,
      computedTotalCost,
      userId: session.userId,
    });

    await this.prismaService.session.update({
      where: { id: session.id },
      data: {
        endTime: stoppedAt,
        energyDelivered: energyDeliveredKwh,
        peakPower: peakPowerKw,
        status: SessionStatus.COMPLETED,
        totalCost: settlementDecision.totalCost,
      },
    });
    await this.notificationsService.sendSessionCompletedNotification({
      sessionId: session.id,
      totalCostAmd: settlementDecision.totalCost,
      userId: session.userId,
    });

    // A charge point cannot receive an HTTP error, so settlement failures (gateway outage,
    // insufficient wallet balance) must not fail the OCPP acknowledgement: the session is
    // completed with its persisted total and the failure surfaces loudly for reconciliation.
    try {
      await this.sessionSettlementService.settleCompletedSession({
        decision: settlementDecision,
        sessionId: session.id,
        userId: session.userId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Settlement failed for session ${session.id} (connector ${session.connectorId}): ${resolveErrorMessage(error)}`,
      );
    }

    return settlementDecision.totalCost;
  }

  /**
   * Creates one ACTIVE session for a charge-point-initiated transaction start and sends the
   * session-started notification. Shared by 1.6 StartTransaction and 2.0.1 TransactionEvent(Started).
   *
   * The conflict check and the insert run inside one SERIALIZABLE transaction (mirroring the API
   * create path in sessions.service.ts) so a charger-local start can never produce a second
   * blocking session on a connector. Returns null when the connector is already held — callers
   * must answer the charge point per protocol (ConcurrentTx) and must NOT create a session.
   * The remote-start ATTACH path never calls this method, so answering a tracked remote start
   * does not trip the guard.
   */
  public async createActiveOcppSession(
    input: OcppActiveSessionCreateInput,
  ): Promise<{ readonly id: string } | null> {
    let createdSession: { readonly id: string } | null;

    try {
      createdSession = await this.prismaService.$transaction(
        async (transaction) => {
          const conflictingSessionCount = await transaction.session.count({
            where: {
              connectorId: input.connectorId,
              status: { in: [...CONNECTOR_BLOCKING_SESSION_STATUSES] },
            },
          });

          if (conflictingSessionCount > 0) {
            return null;
          }

          return transaction.session.create({
            data: {
              connectorId: input.connectorId,
              meterStart: input.meterStartWh,
              startTime: input.startedAt,
              status: SessionStatus.ACTIVE,
              transactionId: input.transactionId,
              userId: input.userId,
            },
            select: {
              id: true,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (isSerializationConflictError(error)) {
        return null;
      }

      throw error;
    }

    if (createdSession === null) {
      return null;
    }

    await this.notificationsService.sendSessionStartedNotification({
      sessionId: createdSession.id,
      userId: input.userId,
    });

    return createdSession;
  }

  /**
   * Attaches one inbound charger transaction to the API session whose RemoteStart requested it.
   *
   * Consumption goes through {@link OcppRemoteStartService.linkTransactionIdToTrackedRemoteStart}
   * — the single tracking-consumption path — which links the newest PENDING record matching
   * (charge point, connector, idTag) and thereby prevents double-firing: a linked record is no
   * longer pending, so a retried StartTransaction cannot match it again.
   *
   * Returns the attached session, or null when no tracked remote start references a live API
   * session (true charger-local start, expired tracking, or a session already in a terminal
   * state) — callers then fall back to the guarded create path.
   */
  public async attachTransactionToTrackedRemoteStart(
    input: OcppTransactionAttachInput,
  ): Promise<{ readonly id: string } | null> {
    const trackedRemoteStart = await this.remoteStartService.linkTransactionIdToTrackedRemoteStart({
      chargePointId: input.chargePointId,
      connectorId: input.ocppConnectorId,
      idTag: input.idTag,
      transactionId: input.transactionId,
    });

    if (trackedRemoteStart === null || trackedRemoteStart.sessionId === null) {
      return null;
    }

    const session = await this.prismaService.session.findUnique({
      where: { id: trackedRemoteStart.sessionId },
      select: {
        id: true,
        startTime: true,
        status: true,
      },
    });

    if (session === null || TERMINAL_SESSION_STATUSES.includes(session.status)) {
      this.logger.warn(
        `Tracked remote start for ${input.chargePointId} references session ${trackedRemoteStart.sessionId} ` +
          `which is ${session === null ? 'missing' : session.status}; falling back to charger-local session handling`,
      );

      return null;
    }

    // The charger may beat the API's own AUTHORIZED -> ACTIVE transition, so the attach also
    // activates the session; when the API already activated it, this is an idempotent update.
    await this.prismaService.session.update({
      where: { id: session.id },
      data: {
        meterStart: input.meterStartWh,
        startTime: session.startTime ?? input.startedAt,
        status: SessionStatus.ACTIVE,
        transactionId: String(input.transactionId),
      },
      select: {
        id: true,
      },
    });
    this.logger.log(
      `Attached inbound transaction ${input.transactionId} from ${input.chargePointId} to API session ${session.id}`,
    );

    return { id: session.id };
  }

  /** Resolves one connector id from charge point identity and OCPP connector number. */
  public async resolveConnectorId(
    chargePointId: string,
    ocppConnectorId: number,
  ): Promise<string | null> {
    const connector = await this.prismaService.connector.findFirst({
      where: {
        station: {
          operatorId: chargePointId,
        },
        OR: buildCandidateEvseIds(chargePointId, ocppConnectorId).map((evseId) => {
          return { evseId };
        }),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: OCPP_CONNECTOR_LOOKUP_SELECT,
    });

    return connector?.id ?? null;
  }

  /**
   * Resolves one existing user id from an OCPP idTag value.
   *
   * The idTag is normally a short opaque token issued by OcppIdTagService (OCPP 1.6 caps
   * idTags at 20 characters, so raw user UUIDs cannot travel over the wire; 2.0.1 idTokens
   * allow 36 characters but use the same issued tokens for consistency); resolved ids are
   * still verified against the users table before a session is attributed to them.
   */
  public async resolveUserId(idTag: string): Promise<string | null> {
    const candidateUserId = await this.idTagService.resolveUserId(idTag);
    if (candidateUserId === null || !isUuid(candidateUserId)) {
      return null;
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: candidateUserId },
      select: USER_LOOKUP_SELECT,
    });

    return user?.id ?? null;
  }

  /**
   * Finds the newest session bound to one OCPP transaction id, scoped to the charge point that
   * owns the connector. Transaction ids are stored as strings: 1.6 uses stringified integers,
   * 2.0.1 uses the charging station's opaque transaction id verbatim.
   */
  public async findSessionByTransactionId(
    chargePointId: string,
    transactionId: string,
  ): Promise<OcppSessionLookupRecord | null> {
    return this.prismaService.session.findFirst({
      where: {
        transactionId,
        connector: {
          station: {
            operatorId: chargePointId,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: SESSION_STOP_LOOKUP_SELECT,
    });
  }

  /** Calculates one final session cost by tariffing measured delivery and charging duration. */
  private async calculateFinalCost(input: {
    readonly connectorId: string | null;
    readonly energyDeliveredKwh: number;
    readonly sessionId: string;
    readonly startedAt: Date;
    readonly stoppedAt: Date;
  }): Promise<number> {
    try {
      const pricing = await this.sessionCostCalculatorService.calculateSessionCost({
        connectorId: input.connectorId,
        energyDeliveredKwh: input.energyDeliveredKwh,
        sessionId: input.sessionId,
        startedAt: input.startedAt,
        stoppedAt: input.stoppedAt,
      });

      return pricing.totalCost;
    } catch (error: unknown) {
      const message = resolveErrorMessage(error);
      // Deliberately loud: the session still completes, but a 0 total on a session that may have
      // delivered energy is a billing anomaly operators must be able to find and reconcile.
      this.logger.error(
        `PRICING FAILURE for session ${input.sessionId} (connector ${input.connectorId}): ${message}. ` +
          `Completing the session with totalCost 0 (${input.energyDeliveredKwh} kWh delivered) — needs manual reconciliation.`,
      );

      return 0;
    }
  }

  /**
   * Allocates one positive integer transaction id for StartTransaction responses.
   *
   * Allocation is a shared Redis INCR so concurrent API replicas never hand out the same id;
   * without Redis it degrades to a per-process counter (see OcppIdAllocator for the limitation).
   */
  private async allocateTransactionId(): Promise<number> {
    return this.transactionIdAllocator.next();
  }
}

/** Validates one inbound OCPP StartTransaction payload. */
function assertStartTransactionPayload(payload: OcppStartTransactionRequest): void {
  if (!Number.isInteger(payload.connectorId) || payload.connectorId <= 0) {
    throw new BadRequestException('StartTransaction connectorId must be a positive integer');
  }

  if (!Number.isFinite(payload.meterStart) || payload.meterStart < 0) {
    throw new BadRequestException('StartTransaction meterStart must be a non-negative number');
  }

  if (payload.idTag.trim().length === 0) {
    throw new BadRequestException('StartTransaction idTag is required');
  }
}

/** Validates one inbound OCPP Authorize payload. */
function assertAuthorizePayload(payload: OcppAuthorizeRequest): void {
  if (typeof payload.idTag !== 'string' || payload.idTag.trim().length === 0) {
    throw new BadRequestException('Authorize idTag is required');
  }
}

/** Validates one inbound OCPP StopTransaction payload. */
function assertStopTransactionPayload(payload: OcppStopTransactionRequest): void {
  if (!Number.isInteger(payload.transactionId) || payload.transactionId <= 0) {
    throw new BadRequestException('StopTransaction transactionId must be a positive integer');
  }

  if (!Number.isFinite(payload.meterStop) || payload.meterStop < 0) {
    throw new BadRequestException('StopTransaction meterStop must be a non-negative number');
  }
}

/** Parses one ISO timestamp string into a valid Date instance. */
function parseIsoTimestamp(rawTimestamp: string, fieldName: string): Date {
  const timestamp = new Date(rawTimestamp);
  if (Number.isNaN(timestamp.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid ISO timestamp`);
  }

  return timestamp;
}

/** Builds one OCPP StartTransaction invalid-idTag response. */
function buildInvalidStartTransactionResponse(): OcppStartTransactionResponse {
  return {
    idTagInfo: {
      status: 'Invalid',
    },
    transactionId: 0,
  };
}

/**
 * Calculates delivered energy in kWh from transaction meter registers, or null when the
 * session has no recorded meterStart (or the stop message carried no register) to diff against.
 */
function calculateEnergyDeliveredFromRegisters(
  meterStartWh: number | null | undefined,
  meterStopWh: number | null,
): number | null {
  if (
    typeof meterStartWh !== 'number' ||
    typeof meterStopWh !== 'number' ||
    !Number.isFinite(meterStopWh) ||
    meterStopWh < meterStartWh
  ) {
    return null;
  }

  return (meterStopWh - meterStartWh) / WATT_HOURS_PER_KILOWATT_HOUR;
}

/** Calculates delivered energy in kWh from session meter-value aggregate snapshots. */
function calculateEnergyDeliveredKwh(stats: MeterValueEnergyAggregate): number {
  const minEnergy = stats._min.energyActiveImport;
  const maxEnergy = stats._max.energyActiveImport;

  if (minEnergy === null || maxEnergy === null) {
    return 0;
  }

  return Math.max(0, (maxEnergy - minEnergy) / WATT_HOURS_PER_KILOWATT_HOUR);
}

/** Calculates peak power in kW from session meter-value aggregate snapshots. */
function calculatePeakPowerKw(stats: MeterValueEnergyAggregate): number {
  const peakPowerWatts = stats._max.powerActiveImport;

  if (peakPowerWatts === null) {
    return 0;
  }

  return Math.max(0, peakPowerWatts / WATTS_PER_KILOWATT);
}

/** Resolves a safe log/error message from an unknown thrown value. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown transaction error';
}

/**
 * Detects PostgreSQL serialization conflicts surfaced by Prisma for SERIALIZABLE transactions.
 * P2034 is Prisma's "transaction failed due to a write conflict or a deadlock" error code.
 */
function isSerializationConflictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

/** Checks whether one raw value is a canonical UUID string. */
function isUuid(rawValue: string): boolean {
  // Any 8-4-4-4-12 hex shape is accepted: existence is verified against the users table, and
  // seeded/imported ids do not always carry RFC 4122 version/variant nibbles.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawValue);
}

/** Builds deterministic EVSE identifier candidates used to resolve OCPP connector updates. */
function buildCandidateEvseIds(chargePointId: string, ocppConnectorId: number): readonly string[] {
  const connectorId = String(ocppConnectorId);

  return [`${chargePointId}-evse-${connectorId}`, `${chargePointId}-${connectorId}`, connectorId];
}
