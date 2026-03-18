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
import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SessionStatus as PrismaSessionStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';

import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

const CONNECTOR_NOT_FOUND_MESSAGE = 'Connector not found';
const END_TIME_BEFORE_START_TIME_MESSAGE = 'Session end time cannot be before start time';
const SESSION_NOT_FOUND_MESSAGE = 'Session not found';
const SESSION_INCOMPLETE_MESSAGE = 'Session is not completed';
const USER_NOT_FOUND_MESSAGE = 'User not found';
const VEHICLE_NOT_FOUND_MESSAGE = 'Vehicle not found';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const CONNECTOR_ID_SELECT = {
  id: true,
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

/** Service responsible for charging session lifecycle state transitions and persistence. */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly walletService: WalletService,
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

    const session = await this.prismaService.session.create({
      data,
      select: SESSION_SELECT,
    });

    return mapSessionRecordToResponse(session);
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

    if (session.status === PrismaSessionStatus.PENDING) {
      session = await this.transitionSessionState(session, PrismaSessionStatus.AUTHORIZED);
    }

    // Check if user has a wallet payment method set as default
    const hasWalletPaymentMethod = await this.hasWalletAsDefaultPaymentMethod(userId);

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

    const completedSession = await this.transitionSessionState(
      session,
      PrismaSessionStatus.COMPLETED,
      {
        endTime: endedAt,
      },
    );
    await this.notificationsService.sendSessionCompletedNotification({
      sessionId: completedSession.id,
      totalCostAmd: completedSession.totalCost,
      userId: completedSession.userId,
    });

    // Check if user has wallet payment method
    const hasWalletPaymentMethod = await this.hasWalletAsDefaultPaymentMethod(userId);

    if (hasWalletPaymentMethod) {
      // Deduct from wallet and create payment record
      await this.walletService.deductBalance({
        amount: completedSession.totalCost,
        sessionId: completedSession.id,
        userId: completedSession.userId,
      });

      // Create payment record for wallet transaction
      await this.createWalletPaymentRecord({
        amount: completedSession.totalCost,
        sessionId: completedSession.id,
        userId: completedSession.userId,
      });
    } else {
      // Use traditional payment gateway capture
      await this.paymentsService.captureAuthorizedPaymentForSession({
        amount: completedSession.totalCost,
        sessionId: completedSession.id,
      });
    }

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
   * Checks if user has a WALLET payment method set as default.
   * @param userId - User ID to check
   * @returns true if user has wallet as default payment method
   */
  private async hasWalletAsDefaultPaymentMethod(userId: string): Promise<boolean> {
    const defaultWalletMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        userId,
        gateway: 'WALLET' as never,
        isDefault: true,
      },
      select: {
        id: true,
      },
    });

    return defaultWalletMethod !== null;
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
   * Creates a Payment record for wallet-based session payments.
   * Wallet payments are immediately captured (no pre-auth/capture flow).
   * @param input - Payment details
   */
  private async createWalletPaymentRecord(input: {
    readonly amount: number;
    readonly sessionId: string;
    readonly userId: string;
  }): Promise<void> {
    const walletPaymentMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        userId: input.userId,
        gateway: 'WALLET' as never,
        isDefault: true,
      },
      select: {
        id: true,
      },
    });

    if (walletPaymentMethod === null) {
      throw new BadRequestException('Wallet payment method not found');
    }

    await this.prismaService.payment.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        paymentMethodId: walletPaymentMethod.id,
        gateway: 'WALLET' as never,
        status: 'CAPTURED' as never,
        amount: input.amount,
        authorizedAmount: input.amount,
        capturedAmount: input.amount,
      },
      select: {
        id: true,
      },
    });
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
