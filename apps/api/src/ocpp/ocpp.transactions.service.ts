import type {
  OcppStartTransactionRequest,
  OcppStartTransactionResponse,
  OcppStopTransactionRequest,
  OcppStopTransactionResponse,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SessionStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionCostCalculatorService } from '../sessions/session-cost-calculator.service';
import { OcppIdTagService } from './ocpp.id-tag.service';
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
  private nextTransactionId: number = Math.max(1, Math.floor(Date.now() / 1000));

  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionCostCalculatorService: SessionCostCalculatorService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly remoteStartService: OcppRemoteStartService,
    private readonly idTagService: OcppIdTagService,
  ) {}

  /**
   * Handles one inbound OCPP StartTransaction payload.
   *
   * When connector and user references are valid, this creates one active session, allocates a
   * central-system transaction id, and links it to tracked remote-start state for later lookups.
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

    const transactionId = this.allocateTransactionId();
    await this.createActiveOcppSession({
      connectorId,
      meterStartWh: payload.meterStart,
      startedAt,
      transactionId: String(transactionId),
      userId,
    });

    await this.remoteStartService.linkTransactionIdToTrackedRemoteStart({
      chargePointId,
      connectorId: payload.connectorId,
      idTag: payload.idTag,
      transactionId,
    });

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
   * notification, and captures the pre-authorized payment.
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
    const totalCost = await this.calculateFinalCost({
      connectorId: session.connectorId,
      energyDeliveredKwh,
      sessionId: session.id,
      startedAt: session.startTime ?? session.createdAt,
      stoppedAt,
    });

    await this.prismaService.session.update({
      where: { id: session.id },
      data: {
        endTime: stoppedAt,
        energyDelivered: energyDeliveredKwh,
        peakPower: peakPowerKw,
        status: SessionStatus.COMPLETED,
        totalCost,
      },
    });
    await this.notificationsService.sendSessionCompletedNotification({
      sessionId: session.id,
      totalCostAmd: totalCost,
      userId: session.userId,
    });
    await this.captureCompletedSessionPayment(session.id, totalCost, session.connectorId);

    return totalCost;
  }

  /**
   * Creates one ACTIVE session for a charge-point-initiated transaction start and sends the
   * session-started notification. Shared by 1.6 StartTransaction and 2.0.1 TransactionEvent(Started).
   */
  public async createActiveOcppSession(
    input: OcppActiveSessionCreateInput,
  ): Promise<{ readonly id: string }> {
    const createdSession = await this.prismaService.session.create({
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
    await this.notificationsService.sendSessionStartedNotification({
      sessionId: createdSession.id,
      userId: input.userId,
    });

    return createdSession;
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
      this.logger.warn(
        `StopTransaction pricing fallback for connector ${input.connectorId}: ${message}`,
      );

      return 0;
    }
  }

  /** Allocates one positive integer transaction id for StartTransaction responses. */
  private allocateTransactionId(): number {
    const allocated = this.nextTransactionId;
    this.nextTransactionId += 1;

    return allocated;
  }

  /** Captures one completed-session payment and degrades gracefully on gateway failures. */
  private async captureCompletedSessionPayment(
    sessionId: string,
    amount: number,
    connectorId: string | null,
  ): Promise<void> {
    try {
      await this.paymentsService.captureAuthorizedPaymentForSession({
        amount,
        sessionId,
      });
    } catch (error: unknown) {
      const message = resolveErrorMessage(error);
      this.logger.warn(`StopTransaction capture fallback for connector ${connectorId}: ${message}`);
    }
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
