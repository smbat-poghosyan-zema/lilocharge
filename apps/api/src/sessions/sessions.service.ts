import type {
  CreateSessionRequest,
  SessionHistoryItem,
  SessionHistoryQuery,
  SessionHistoryResponse,
  SessionReceiptData,
  SessionResponse,
  StartSessionRequest,
  StopSessionRequest,
} from '@lilocharge/shared-types';
import { SessionStatus as SharedSessionStatus } from '@lilocharge/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma, SessionStatus as PrismaSessionStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';

import { NotificationsService } from '../notifications/notifications.service';
import type { OcppRemoteStartResult } from '../ocpp/ocpp.remote-start.service';
import { OcppIdTagService } from '../ocpp/ocpp.id-tag.service';
import { OcppRemoteStartService } from '../ocpp/ocpp.remote-start.service';
import { OcppRemoteStopService } from '../ocpp/ocpp.remote-stop.service';
import { isOcppServerEnabled } from '../ocpp/ocpp.server.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { SessionCostCalculatorService } from './session-cost-calculator.service';
import { SessionSettlementService } from './session-settlement.service';

const CONNECTOR_NOT_FOUND_MESSAGE = 'Connector not found';
const END_TIME_BEFORE_START_TIME_MESSAGE = 'Session end time cannot be before start time';
const SESSION_NOT_FOUND_MESSAGE = 'Session not found';
const SESSION_INCOMPLETE_MESSAGE = 'Session is not completed';
const USER_NOT_FOUND_MESSAGE = 'User not found';
const VEHICLE_NOT_FOUND_MESSAGE = 'Vehicle not found';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const CONNECTOR_ALREADY_IN_USE_MESSAGE =
  'Connector already has a pending or active charging session';

/**
 * Session lifecycle states that make a connector unavailable for a new session.
 * A connector may carry at most one session in any of these states at a time.
 */
const CONNECTOR_BLOCKING_SESSION_STATUSES: readonly PrismaSessionStatus[] = [
  PrismaSessionStatus.PENDING,
  PrismaSessionStatus.AUTHORIZED,
  PrismaSessionStatus.ACTIVE,
];

const WATT_HOURS_PER_KILOWATT_HOUR = 1000;
const WATTS_PER_KILOWATT = 1000;

const CONNECTOR_ID_SELECT = {
  id: true,
} satisfies Prisma.ConnectorSelect;

const CONNECTOR_CHARGE_POINT_SELECT = {
  evseId: true,
  id: true,
  station: {
    select: {
      operatorId: true,
    },
  },
} satisfies Prisma.ConnectorSelect;

const SESSION_SELECT = {
  connectorId: true,
  createdAt: true,
  endTime: true,
  energyDelivered: true,
  id: true,
  peakPower: true,
  startTime: true,
  status: true,
  totalCost: true,
  transactionId: true,
  updatedAt: true,
  userId: true,
  vehicleId: true,
} satisfies Prisma.SessionSelect;

const USER_ID_SELECT = {
  id: true,
} satisfies Prisma.UserSelect;

const VEHICLE_ID_SELECT = {
  id: true,
} satisfies Prisma.VehicleSelect;

const SESSION_STATE_TRANSITIONS: Record<PrismaSessionStatus, readonly PrismaSessionStatus[]> = {
  [PrismaSessionStatus.PENDING]: [PrismaSessionStatus.AUTHORIZED, PrismaSessionStatus.CANCELLED],
  [PrismaSessionStatus.AUTHORIZED]: [PrismaSessionStatus.ACTIVE, PrismaSessionStatus.CANCELLED],
  [PrismaSessionStatus.ACTIVE]: [PrismaSessionStatus.COMPLETED, PrismaSessionStatus.FAILED],
  [PrismaSessionStatus.COMPLETED]: [],
  [PrismaSessionStatus.FAILED]: [],
  [PrismaSessionStatus.CANCELLED]: [],
};

type SessionRecord = Prisma.SessionGetPayload<{
  select: typeof SESSION_SELECT;
}>;

/** Resolved OCPP addressing details for the charge point that owns one connector. */
interface ChargePointBinding {
  readonly chargePointId: string;
  readonly ocppConnectorId: number;
}

/** Finalized billing metrics computed while completing one session server-side. */
interface SessionFinalization {
  readonly energyDeliveredKwh: number | null;
  readonly peakPowerKw: number | null;
  readonly totalCost: number;
}

/** Service responsible for charging session lifecycle state transitions and persistence. */
@Injectable()
export class SessionsService {
  private readonly logger: Logger = new Logger(SessionsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly walletService: WalletService,
    private readonly sessionCostCalculatorService: SessionCostCalculatorService,
    private readonly ocppRemoteStartService: OcppRemoteStartService,
    private readonly ocppRemoteStopService: OcppRemoteStopService,
    private readonly ocppIdTagService: OcppIdTagService,
    private readonly sessionSettlementService: SessionSettlementService,
  ) {}

  /** Creates one pending charging session for a user with optional vehicle and connector links. */
  public async createSession(
    userId: string,
    request: CreateSessionRequest,
  ): Promise<SessionResponse> {
    await this.assertUserExists(userId);

    if (request.vehicleId !== undefined) {
      await this.assertVehicleOwnedByUser(userId, request.vehicleId);
    }

    if (request.connectorId !== undefined) {
      await this.assertConnectorExists(request.connectorId);
    }

    const data: Prisma.SessionUncheckedCreateInput = {
      status: PrismaSessionStatus.PENDING,
      userId,
    };

    if (request.connectorId !== undefined) {
      data.connectorId = request.connectorId;
    }

    if (request.vehicleId !== undefined) {
      data.vehicleId = request.vehicleId;
    }

    if (request.connectorId === undefined) {
      const session = await this.prismaService.session.create({
        data,
        select: SESSION_SELECT,
      });

      return mapSessionRecordToResponse(session);
    }

    const session = await this.createSessionWithConnectorGuard(request.connectorId, data);

    return mapSessionRecordToResponse(session);
  }

  /**
   * Creates one connector-linked session while enforcing the one-session-per-connector invariant.
   *
   * The conflict check and the insert run inside one SERIALIZABLE transaction so two concurrent
   * create requests for the same connector cannot both pass the check: PostgreSQL aborts one of
   * them with a serialization failure (Prisma error P2034), which is surfaced as the same 409 a
   * losing sequential request would receive. Sessions without a connector never conflict, and a
   * session can only gain a connector at creation time, so this guard is the single enforcement
   * point for the invariant on the API path.
   */
  private async createSessionWithConnectorGuard(
    connectorId: string,
    data: Prisma.SessionUncheckedCreateInput,
  ): Promise<SessionRecord> {
    try {
      return await this.prismaService.$transaction(
        async (transaction) => {
          const conflictingSessionCount = await transaction.session.count({
            where: {
              connectorId,
              status: { in: [...CONNECTOR_BLOCKING_SESSION_STATUSES] },
            },
          });

          if (conflictingSessionCount > 0) {
            throw new ConflictException(CONNECTOR_ALREADY_IN_USE_MESSAGE);
          }

          return transaction.session.create({
            data,
            select: SESSION_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (isSerializationConflictError(error)) {
        throw new ConflictException(CONNECTOR_ALREADY_IN_USE_MESSAGE);
      }

      throw error;
    }
  }

  /** Starts one charging session by transitioning pending -> authorized -> active. */
  public async startSession(
    userId: string,
    sessionId: string,
    request: StartSessionRequest,
  ): Promise<SessionResponse> {
    const startedAt = parseOptionalIsoTimestamp(request.startedAt, 'startedAt') ?? new Date();
    let session = await this.findUserSessionOrThrow(userId, sessionId);
    assertSessionCanTransitionToActive(session.status);
    await this.assertConnectorNotHeldByOtherSession(session);

    if (session.status === PrismaSessionStatus.PENDING) {
      session = await this.transitionSessionState(session, PrismaSessionStatus.AUTHORIZED);
    }

    // Check if user has a wallet payment method set as default
    const hasWalletPaymentMethod =
      await this.sessionSettlementService.hasWalletAsDefaultPaymentMethod(userId);

    if (hasWalletPaymentMethod) {
      // For wallet payment: check sufficient balance upfront (no pre-auth)
      const minimumRequiredBalance = this.getMinimumSessionBalance();
      const hasSufficientBalance = await this.walletService.checkSufficientBalance(
        userId,
        minimumRequiredBalance,
      );

      if (!hasSufficientBalance) {
        throw new BadRequestException(
          `Insufficient wallet balance. Minimum required: ${minimumRequiredBalance} AMD`,
        );
      }
    } else {
      // Use traditional payment gateway pre-authorization
      await this.paymentsService.preAuthorizeArcaForSession({
        sessionId: session.id,
        userId,
      });
    }

    await this.dispatchRemoteStartForSession(session);

    const activeSession = await this.transitionSessionState(session, PrismaSessionStatus.ACTIVE, {
      startTime: startedAt,
    });
    await this.notificationsService.sendSessionStartedNotification({
      sessionId: activeSession.id,
      userId: activeSession.userId,
    });

    return mapSessionRecordToResponse(activeSession);
  }

  /** Stops one active charging session by transitioning active -> completed. */
  public async stopSession(
    userId: string,
    sessionId: string,
    request: StopSessionRequest,
  ): Promise<SessionResponse> {
    const endedAt = parseOptionalIsoTimestamp(request.endedAt, 'endedAt') ?? new Date();
    const session = await this.findUserSessionOrThrow(userId, sessionId);

    if (session.startTime !== null && endedAt.getTime() < session.startTime.getTime()) {
      throw new BadRequestException(END_TIME_BEFORE_START_TIME_MESSAGE);
    }

    await this.dispatchRemoteStopForSession(session);

    const finalization = await this.resolveSessionFinalization(session, endedAt);
    // The settlement decision (zero-energy refund vs wallet deduction vs gateway capture, and
    // the total to persist) is shared with the OCPP charger-stop path via the settlement service
    // so both stop paths bill identically.
    const settlementDecision = await this.sessionSettlementService.resolveSettlement({
      billableEnergyKwh: finalization.energyDeliveredKwh ?? session.energyDelivered,
      computedTotalCost: finalization.totalCost,
      userId,
    });
    const completionData: Prisma.SessionUpdateInput = {
      endTime: endedAt,
      totalCost: settlementDecision.totalCost,
    };

    if (finalization.energyDeliveredKwh !== null) {
      completionData.energyDelivered = finalization.energyDeliveredKwh;
    }

    if (finalization.peakPowerKw !== null) {
      completionData.peakPower = finalization.peakPowerKw;
    }

    const completedSession = await this.transitionSessionState(
      session,
      PrismaSessionStatus.COMPLETED,
      completionData,
    );
    await this.notificationsService.sendSessionCompletedNotification({
      sessionId: completedSession.id,
      totalCostAmd: completedSession.totalCost,
      userId: completedSession.userId,
    });
    await this.sessionSettlementService.settleCompletedSession({
      decision: settlementDecision,
      sessionId: completedSession.id,
      userId: completedSession.userId,
    });

    return mapSessionRecordToResponse(completedSession);
  }

  /**
   * Retrieves paginated session history for a user with optional filtering.
   * @param userId - User ID to retrieve sessions for
   * @param query - Pagination and filter parameters
   * @returns Paginated session history response
   */
  public async getSessionHistory(
    userId: string,
    query: SessionHistoryQuery,
  ): Promise<SessionHistoryResponse> {
    await this.assertUserExists(userId);

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = {
      userId,
    };

    if (query.status !== undefined) {
      where.status = mapSharedSessionStatusToPrismaEnum(query.status);
    }

    if (query.startDate !== undefined || query.endDate !== undefined) {
      where.createdAt = {};
      if (query.startDate !== undefined) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate !== undefined) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [sessions, total] = await Promise.all([
      this.prismaService.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          connector: {
            include: {
              station: {
                select: {
                  name: true,
                  address: true,
                },
              },
            },
          },
        },
      }),
      this.prismaService.session.count({ where }),
    ]);

    const sessionItems: SessionHistoryItem[] = sessions.map((session) => ({
      connectorType: session.connector?.connectorType ?? null,
      createdAt: session.createdAt.toISOString(),
      endTime: session.endTime?.toISOString() ?? null,
      energyDelivered: session.energyDelivered,
      id: session.id,
      powerKw: session.connector?.powerKw ?? null,
      startTime: session.startTime?.toISOString() ?? null,
      stationAddress: session.connector?.station.address ?? null,
      stationName: session.connector?.station.name ?? null,
      status: mapPrismaSessionStatusToSharedEnum(session.status),
      totalCost: session.totalCost,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      limit,
      page,
      sessions: sessionItems,
      total,
      totalPages,
    };
  }

  /**
   * Retrieves a single session by ID for a user.
   * @param userId - User ID that owns the session
   * @param sessionId - Session ID to retrieve
   * @returns Session response with full details
   */
  public async getSessionById(userId: string, sessionId: string): Promise<SessionResponse> {
    const session = await this.findUserSessionOrThrow(userId, sessionId);
    return mapSessionRecordToResponse(session);
  }

  /**
   * Sends one OCPP RemoteStartTransaction command to the charge point owning the session connector.
   *
   * Dispatch is skipped when the OCPP central system is disabled (`OCPP_WS_ENABLED=false`, used by
   * local development and tests without real chargers) or when the session has no linked connector.
   * When dispatch runs, a disconnected or rejecting charge point aborts the start flow with a 409
   * so the session stays AUTHORIZED and the start request can be retried.
   */
  private async dispatchRemoteStartForSession(session: SessionRecord): Promise<void> {
    if (!isOcppServerEnabled(process.env.OCPP_WS_ENABLED)) {
      this.logger.warn(
        `Skipping RemoteStartTransaction for session ${session.id}: OCPP server is disabled`,
      );
      return;
    }

    if (session.connectorId === null) {
      this.logger.warn(
        `Skipping RemoteStartTransaction for session ${session.id}: session has no connector`,
      );
      return;
    }

    const binding = await this.resolveChargePointBinding(session.connectorId);
    // OCPP 1.6 idTags are capped at 20 characters, so the user id travels as a short opaque
    // token that the charge point echoes back in its StartTransaction message.
    const idTag = await this.ocppIdTagService.issueIdTag(session.userId);
    let result: OcppRemoteStartResult;

    try {
      result = await this.ocppRemoteStartService.remoteStartTransaction({
        chargePointId: binding.chargePointId,
        payload: {
          connectorId: binding.ocppConnectorId,
          idTag,
        },
        // The tracking record carries the API session id so the charger's answering
        // StartTransaction / TransactionEvent(Started) attaches its transaction to THIS session
        // instead of creating a duplicate one.
        sessionId: session.id,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new ConflictException(
          `Charge point ${binding.chargePointId} is not connected; cannot start charging for session ${session.id}`,
        );
      }

      throw error;
    }

    if (result.status === 'Rejected') {
      throw new ConflictException(
        `Charge point ${binding.chargePointId} rejected the remote start request for session ${session.id}`,
      );
    }
  }

  /**
   * Sends one OCPP RemoteStopTransaction command for sessions started through OCPP.
   *
   * Dispatch only applies when the session carries an OCPP transaction id. Both id shapes flow
   * through: 1.6 integer ids (persisted as numeric strings) and 2.0.1 station-assigned string
   * ids — the remote-stop service builds the wire payload per negotiated protocol. Failures
   * (charge point offline, timeout, or Rejected response) are logged and tolerated so the
   * session can still be finalized server-side with a computed cost.
   */
  private async dispatchRemoteStopForSession(session: SessionRecord): Promise<void> {
    const transactionId = normalizeOcppTransactionId(session.transactionId);

    if (transactionId === null) {
      return;
    }

    if (!isOcppServerEnabled(process.env.OCPP_WS_ENABLED)) {
      this.logger.warn(
        `Skipping RemoteStopTransaction for session ${session.id}: OCPP server is disabled`,
      );
      return;
    }

    if (session.connectorId === null) {
      return;
    }

    try {
      const binding = await this.resolveChargePointBinding(session.connectorId);
      const result = await this.ocppRemoteStopService.remoteStopTransaction({
        chargePointId: binding.chargePointId,
        payload: {
          transactionId,
        },
      });

      if (result.status === 'Rejected') {
        this.logger.warn(
          `Charge point ${binding.chargePointId} rejected RemoteStopTransaction for session ${session.id}; finalizing server-side`,
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `RemoteStopTransaction dispatch failed for session ${session.id}: ${resolveErrorMessage(error)}; finalizing server-side`,
      );
    }
  }

  /** Resolves OCPP charge point addressing for one connector via its owning station. */
  private async resolveChargePointBinding(connectorId: string): Promise<ChargePointBinding> {
    const connector = await this.prismaService.connector.findUnique({
      where: { id: connectorId },
      select: CONNECTOR_CHARGE_POINT_SELECT,
    });

    if (connector === null) {
      throw new NotFoundException(CONNECTOR_NOT_FOUND_MESSAGE);
    }

    const chargePointId = connector.station.operatorId;

    return {
      chargePointId,
      ocppConnectorId: resolveOcppConnectorNumber(chargePointId, connector.evseId),
    };
  }

  /**
   * Computes finalized billing metrics for one API-driven session stop.
   *
   * Energy and peak power come from ingested meter values when available; otherwise the session's
   * previously persisted energy figure is used. The final cost keeps an already-billed non-zero
   * total (for example, persisted by the OCPP StopTransaction path), and is otherwise computed
   * from tariffs so an API-driven stop never bills zero for a session that consumed energy.
   */
  private async resolveSessionFinalization(
    session: SessionRecord,
    endedAt: Date,
  ): Promise<SessionFinalization> {
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
    const energyDeliveredKwh = calculateEnergyDeliveredKwh(
      meterStats._min.energyActiveImport,
      meterStats._max.energyActiveImport,
    );
    const peakPowerKw = calculatePeakPowerKw(meterStats._max.powerActiveImport);
    const billableEnergyKwh = energyDeliveredKwh ?? session.energyDelivered;

    if (session.totalCost > 0) {
      return {
        energyDeliveredKwh,
        peakPowerKw,
        totalCost: session.totalCost,
      };
    }

    try {
      const pricing = await this.sessionCostCalculatorService.calculateSessionCost({
        connectorId: session.connectorId,
        energyDeliveredKwh: billableEnergyKwh,
        sessionId: session.id,
        startedAt: session.startTime ?? session.createdAt,
        stoppedAt: endedAt,
      });

      return {
        energyDeliveredKwh,
        peakPowerKw,
        totalCost: pricing.totalCost,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `Session ${session.id} cost calculation failed: ${resolveErrorMessage(error)}; keeping persisted total`,
      );

      return {
        energyDeliveredKwh,
        peakPowerKw,
        totalCost: session.totalCost,
      };
    }
  }

  /**
   * Gets the minimum required wallet balance to start a session.
   * This is a conservative estimate to prevent session start with near-zero balance.
   * @returns Minimum balance in AMD (default 1000 AMD ≈ $2.50)
   */
  private getMinimumSessionBalance(): number {
    const envValue = process.env.MINIMUM_SESSION_BALANCE_AMD;
    if (envValue !== undefined) {
      const parsed = Number(envValue);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 1000; // Default: 1000 AMD
  }

  /**
   * Generates a PDF receipt for a completed session.
   * @param userId - User ID that owns the session
   * @param sessionId - Session ID to generate receipt for
   * @returns StreamableFile containing the PDF receipt
   */
  public async generateSessionReceipt(userId: string, sessionId: string): Promise<StreamableFile> {
    const session = await this.prismaService.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      include: {
        connector: {
          include: {
            station: true,
          },
        },
        user: {
          select: {
            displayName: true,
            email: true,
          },
        },
      },
    });

    if (session === null) {
      throw new NotFoundException(SESSION_NOT_FOUND_MESSAGE);
    }

    if (session.status !== PrismaSessionStatus.COMPLETED) {
      throw new BadRequestException(SESSION_INCOMPLETE_MESSAGE);
    }

    if (session.startTime === null || session.endTime === null) {
      throw new BadRequestException(SESSION_INCOMPLETE_MESSAGE);
    }

    const duration = Math.floor(
      (session.endTime.getTime() - session.startTime.getTime()) / 1000 / 60,
    );

    const receiptData: SessionReceiptData = {
      connectorType: session.connector?.connectorType ?? 'N/A',
      duration,
      endTime: session.endTime.toISOString(),
      energyDelivered: session.energyDelivered,
      generatedAt: new Date().toISOString(),
      peakPower: session.peakPower,
      powerKw: session.connector?.powerKw ?? 0,
      receiptNumber: `RCP-${session.id.slice(0, 8).toUpperCase()}`,
      sessionId: session.id,
      startTime: session.startTime.toISOString(),
      stationAddress: session.connector?.station.address ?? 'N/A',
      stationName: session.connector?.station.name ?? 'Unknown Station',
      totalCost: session.totalCost,
      userEmail: session.user.email,
      userId: session.userId,
      userName: session.user.displayName,
    };

    const pdfBuffer = await this.createPdfReceipt(receiptData);

    return new StreamableFile(pdfBuffer, {
      disposition: `attachment; filename="receipt-${session.id}.pdf"`,
      type: 'application/pdf',
    });
  }

  /**
   * Creates a PDF document buffer from receipt data.
   * @param data - Receipt data to include in the PDF
   * @returns Buffer containing the PDF document
   */
  private async createPdfReceipt(data: SessionReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).text('LiloCharge', { align: 'center' });
      doc.fontSize(12).text('Charging Session Receipt', { align: 'center' });
      doc.moveDown();

      // Receipt details
      doc.fontSize(10).text(`Receipt Number: ${data.receiptNumber}`, { align: 'right' });
      doc.text(`Generated: ${new Date(data.generatedAt).toLocaleString('hy-AM')}`, {
        align: 'right',
      });
      doc.moveDown();

      // Customer information
      doc.fontSize(14).text('Customer Information', { underline: true });
      doc.fontSize(10).moveDown(0.5);
      doc.text(`Name: ${data.userName}`);
      doc.text(`Email: ${data.userEmail}`);
      doc.moveDown();

      // Station information
      doc.fontSize(14).text('Charging Station', { underline: true });
      doc.fontSize(10).moveDown(0.5);
      doc.text(`Station: ${data.stationName}`);
      doc.text(`Address: ${data.stationAddress}`);
      doc.text(`Connector Type: ${data.connectorType}`);
      doc.text(`Power: ${data.powerKw} kW`);
      doc.moveDown();

      // Session details
      doc.fontSize(14).text('Session Details', { underline: true });
      doc.fontSize(10).moveDown(0.5);
      doc.text(`Session ID: ${data.sessionId}`);
      doc.text(`Start Time: ${new Date(data.startTime).toLocaleString('hy-AM')}`);
      doc.text(`End Time: ${new Date(data.endTime).toLocaleString('hy-AM')}`);
      doc.text(`Duration: ${data.duration} minutes`);
      doc.moveDown();

      // Energy and cost
      doc.fontSize(14).text('Charging Summary', { underline: true });
      doc.fontSize(10).moveDown(0.5);
      doc.text(`Energy Delivered: ${data.energyDelivered.toFixed(2)} kWh`);
      doc.text(`Peak Power: ${data.peakPower.toFixed(2)} kW`);
      doc.moveDown();

      // Total cost
      doc.fontSize(16).text(`Total Cost: ${(data.totalCost / 100).toFixed(2)} AMD`, {
        align: 'right',
      });

      doc.moveDown(2);
      doc.fontSize(8).text('Thank you for choosing LiloCharge!', { align: 'center' });

      doc.end();
    });
  }

  /** Verifies that one user id exists before lifecycle operations run. */
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: USER_ID_SELECT,
    });

    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }
  }

  /** Verifies that one connector id exists before session creation links it. */
  private async assertConnectorExists(connectorId: string): Promise<void> {
    const connector = await this.prismaService.connector.findUnique({
      where: { id: connectorId },
      select: CONNECTOR_ID_SELECT,
    });

    if (connector === null) {
      throw new NotFoundException(CONNECTOR_NOT_FOUND_MESSAGE);
    }
  }

  /**
   * Verifies that no other session currently holds this session's connector.
   *
   * This is a defense-in-depth re-check on the start path: the create path already enforces the
   * one-session-per-connector invariant transactionally, but sessions created before that guard
   * existed (or rows written by non-API paths such as OCPP StartTransaction) could still collide.
   */
  private async assertConnectorNotHeldByOtherSession(session: SessionRecord): Promise<void> {
    if (session.connectorId === null) {
      return;
    }

    const conflictingSessionCount = await this.prismaService.session.count({
      where: {
        connectorId: session.connectorId,
        id: { not: session.id },
        status: { in: [...CONNECTOR_BLOCKING_SESSION_STATUSES] },
      },
    });

    if (conflictingSessionCount > 0) {
      throw new ConflictException(CONNECTOR_ALREADY_IN_USE_MESSAGE);
    }
  }

  /** Verifies that one vehicle id exists and is owned by the requested user. */
  private async assertVehicleOwnedByUser(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prismaService.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId,
      },
      select: VEHICLE_ID_SELECT,
    });

    if (vehicle === null) {
      throw new NotFoundException(VEHICLE_NOT_FOUND_MESSAGE);
    }
  }

  /** Resolves one session by user ownership and session id. */
  private async findUserSessionOrThrow(userId: string, sessionId: string): Promise<SessionRecord> {
    const session = await this.prismaService.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: SESSION_SELECT,
    });

    if (session === null) {
      throw new NotFoundException(SESSION_NOT_FOUND_MESSAGE);
    }

    return session;
  }

  /** Applies one validated session state transition and persists optional transition fields. */
  private async transitionSessionState(
    session: SessionRecord,
    targetStatus: PrismaSessionStatus,
    additionalData?: Prisma.SessionUpdateInput,
  ): Promise<SessionRecord> {
    assertSessionStateTransitionAllowed(session.status, targetStatus);

    const data: Prisma.SessionUpdateInput = {
      ...(additionalData ?? {}),
      status: targetStatus,
    };

    const updatedSession = await this.prismaService.session.update({
      where: { id: session.id },
      data,
      select: SESSION_SELECT,
    });

    if (
      targetStatus === PrismaSessionStatus.CANCELLED ||
      targetStatus === PrismaSessionStatus.FAILED
    ) {
      await this.paymentsService.refundPaymentForSessionFailure(updatedSession.id);
    }

    return updatedSession;
  }
}

/** Validates that one state transition is allowed by the lifecycle graph. */
function assertSessionStateTransitionAllowed(
  fromStatus: PrismaSessionStatus,
  toStatus: PrismaSessionStatus,
): void {
  const allowedTargets = SESSION_STATE_TRANSITIONS[fromStatus];
  if (allowedTargets.includes(toStatus)) {
    return;
  }

  throw new BadRequestException(
    `Session transition from ${fromStatus} to ${toStatus} is not allowed`,
  );
}

/** Validates that one session can proceed into start flow before payment pre-authorization. */
function assertSessionCanTransitionToActive(status: PrismaSessionStatus): void {
  if (status === PrismaSessionStatus.PENDING || status === PrismaSessionStatus.AUTHORIZED) {
    return;
  }

  assertSessionStateTransitionAllowed(status, PrismaSessionStatus.ACTIVE);
}

/** Parses one optional ISO timestamp field and returns null when omitted. */
function parseOptionalIsoTimestamp(
  rawTimestamp: string | undefined,
  fieldName: string,
): Date | null {
  if (rawTimestamp === undefined) {
    return null;
  }

  const parsedTimestamp = new Date(rawTimestamp);
  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid ISO timestamp`);
  }

  return parsedTimestamp;
}

/** Maps Prisma session status values into shared lifecycle status enum values. */
function mapPrismaSessionStatusToSharedEnum(status: PrismaSessionStatus): SharedSessionStatus {
  switch (status) {
    case PrismaSessionStatus.AUTHORIZED:
      return SharedSessionStatus.AUTHORIZED;
    case PrismaSessionStatus.ACTIVE:
      return SharedSessionStatus.ACTIVE;
    case PrismaSessionStatus.COMPLETED:
      return SharedSessionStatus.COMPLETED;
    case PrismaSessionStatus.FAILED:
      return SharedSessionStatus.FAILED;
    case PrismaSessionStatus.CANCELLED:
      return SharedSessionStatus.CANCELLED;
    case PrismaSessionStatus.PENDING:
    default:
      return SharedSessionStatus.PENDING;
  }
}

/** Maps shared session status enum values into Prisma session status values. */
function mapSharedSessionStatusToPrismaEnum(status: SharedSessionStatus): PrismaSessionStatus {
  switch (status) {
    case SharedSessionStatus.AUTHORIZED:
      return PrismaSessionStatus.AUTHORIZED;
    case SharedSessionStatus.ACTIVE:
      return PrismaSessionStatus.ACTIVE;
    case SharedSessionStatus.COMPLETED:
      return PrismaSessionStatus.COMPLETED;
    case SharedSessionStatus.FAILED:
      return PrismaSessionStatus.FAILED;
    case SharedSessionStatus.CANCELLED:
      return PrismaSessionStatus.CANCELLED;
    case SharedSessionStatus.PENDING:
    default:
      return PrismaSessionStatus.PENDING;
  }
}

/**
 * Resolves the OCPP connector number for one connector by inverting persisted EVSE id formats.
 *
 * This mirrors the candidate EVSE id formats used to resolve inbound OCPP messages
 * (see buildCandidateEvseIds in ocpp.transactions.service.ts): `{chargePointId}-evse-{n}`,
 * `{chargePointId}-{n}`, or a bare number. Legacy EVSE ids with a trailing numeric segment fall
 * back to that segment, and connector number 1 is used as the last resort.
 */
function resolveOcppConnectorNumber(chargePointId: string, evseId: string): number {
  const normalizedEvseId = evseId.trim();
  const prefixes = [`${chargePointId}-evse-`, `${chargePointId}-`];

  for (const prefix of prefixes) {
    if (normalizedEvseId.startsWith(prefix)) {
      const candidate = Number(normalizedEvseId.slice(prefix.length));
      if (Number.isInteger(candidate) && candidate > 0) {
        return candidate;
      }
    }
  }

  if (/^\d+$/.test(normalizedEvseId)) {
    const candidate = Number(normalizedEvseId);
    if (candidate > 0) {
      return candidate;
    }
  }

  const trailingNumberMatch = /-0*(\d+)$/.exec(normalizedEvseId);
  if (trailingNumberMatch !== null) {
    const candidate = Number(trailingNumberMatch[1]);
    if (candidate > 0) {
      return candidate;
    }
  }

  return 1;
}

/**
 * Normalizes one persisted OCPP transaction id for RemoteStop dispatch, or null when absent.
 *
 * 1.6 sessions persist stringified positive integers, which are converted back to numbers.
 * 2.0.1 sessions persist the station-assigned opaque string id verbatim, which must flow
 * through untouched so RequestStopTransaction can address the transaction.
 */
function normalizeOcppTransactionId(rawTransactionId: string | null): number | string | null {
  if (rawTransactionId === null) {
    return null;
  }

  const normalized = rawTransactionId.trim();
  if (normalized.length === 0) {
    return null;
  }

  const numericTransactionId = Number(normalized);
  if (Number.isInteger(numericTransactionId) && numericTransactionId > 0) {
    return numericTransactionId;
  }

  return normalized;
}

/** Calculates delivered energy in kWh from meter-value aggregates, or null without meter data. */
function calculateEnergyDeliveredKwh(
  minEnergyWh: number | null,
  maxEnergyWh: number | null,
): number | null {
  if (minEnergyWh === null || maxEnergyWh === null) {
    return null;
  }

  return Math.max(0, (maxEnergyWh - minEnergyWh) / WATT_HOURS_PER_KILOWATT_HOUR);
}

/** Calculates peak power in kW from meter-value aggregates, or null without meter data. */
function calculatePeakPowerKw(peakPowerWatts: number | null): number | null {
  if (peakPowerWatts === null) {
    return null;
  }

  return Math.max(0, peakPowerWatts / WATTS_PER_KILOWATT);
}

/**
 * Detects PostgreSQL serialization conflicts surfaced by Prisma for SERIALIZABLE transactions.
 * P2034 is Prisma's "transaction failed due to a write conflict or a deadlock" error code.
 */
function isSerializationConflictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

/** Resolves a safe log/error message from an unknown thrown value. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown session error';
}

/** Maps one selected Prisma session row into a public API session payload. */
function mapSessionRecordToResponse(session: SessionRecord): SessionResponse {
  return {
    connectorId: session.connectorId,
    createdAt: session.createdAt.toISOString(),
    endTime: session.endTime?.toISOString() ?? null,
    energyDelivered: session.energyDelivered,
    id: session.id,
    peakPower: session.peakPower,
    startTime: session.startTime?.toISOString() ?? null,
    status: mapPrismaSessionStatusToSharedEnum(session.status),
    totalCost: session.totalCost,
    transactionId: session.transactionId,
    updatedAt: session.updatedAt.toISOString(),
    userId: session.userId,
    vehicleId: session.vehicleId,
  };
}
