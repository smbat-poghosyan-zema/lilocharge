import type {
  ConnectorStatusUpdateResponse,
  CreateConnectorStatusUpdateRequest,
  ListConnectorStatusUpdatesQueryRequest,
  MostConfidentStatusResponse,
  StationStatus,
} from '@lilocharge/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const CONNECTOR_NOT_FOUND_MESSAGE = 'Connector not found';

const USER_ID_SELECT = {
  id: true,
} satisfies Prisma.UserSelect;

const STATUS_UPDATE_SELECT = {
  comment: true,
  confidenceScore: true,
  connectorId: true,
  createdAt: true,
  id: true,
  status: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.ConnectorStatusUpdateSelect;

const STATUS_UPDATE_WITH_CONNECTOR_SELECT = {
  comment: true,
  confidenceScore: true,
  connector: {
    select: {
      connectorType: true,
      evseId: true,
      id: true,
      powerKw: true,
      station: {
        select: {
          address: true,
          city: true,
          id: true,
          name: true,
        },
      },
    },
  },
  connectorId: true,
  createdAt: true,
  id: true,
  status: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.ConnectorStatusUpdateSelect;

type StatusUpdateRecord = Prisma.ConnectorStatusUpdateGetPayload<{
  select: typeof STATUS_UPDATE_SELECT;
}>;

type StatusUpdateWithConnectorRecord = Prisma.ConnectorStatusUpdateGetPayload<{
  select: typeof STATUS_UPDATE_WITH_CONNECTOR_SELECT;
}>;

/**
 * Service responsible for connector status update CRUD operations.
 * Implements confidence scoring based on recency and user reputation.
 */
@Injectable()
export class ConnectorStatusUpdatesService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Creates a new connector status update with confidence scoring.
   * Confidence is calculated based on user reputation and recency.
   */
  public async createStatusUpdate(
    userId: string,
    data: CreateConnectorStatusUpdateRequest,
  ): Promise<ConnectorStatusUpdateResponse> {
    await this.assertUserExists(userId);
    await this.assertConnectorExists(data.connectorId);

    const userReputation = await this.calculateUserReputation(userId);
    const confidenceScore = this.calculateInitialConfidence(userReputation);

    const statusUpdate = await this.prismaService.connectorStatusUpdate.create({
      data: {
        comment: data.comment ?? null,
        confidenceScore,
        connectorId: data.connectorId,
        status: data.status,
        userId,
      },
      select: STATUS_UPDATE_WITH_CONNECTOR_SELECT,
    });

    return mapStatusUpdateWithConnectorRecordToResponse(statusUpdate);
  }

  /**
   * Lists connector status updates with pagination.
   * Can be filtered by connectorId or userId.
   */
  public async getStatusUpdates(
    query: ListConnectorStatusUpdatesQueryRequest,
  ): Promise<ConnectorStatusUpdateResponse[]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConnectorStatusUpdateWhereInput = {};

    if (query.connectorId !== undefined) {
      await this.assertConnectorExists(query.connectorId);
      where.connectorId = query.connectorId;
    }

    if (query.userId !== undefined) {
      await this.assertUserExists(query.userId);
      where.userId = query.userId;
    }

    const statusUpdates = await this.prismaService.connectorStatusUpdate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: STATUS_UPDATE_SELECT,
    });

    return statusUpdates.map((update) => mapStatusUpdateRecordToResponse(update));
  }

  /**
   * Gets the most confident status update for a specific connector.
   * Recalculates confidence scores on the fly based on current time.
   */
  public async getMostConfidentStatus(
    connectorId: string,
  ): Promise<MostConfidentStatusResponse | null> {
    await this.assertConnectorExists(connectorId);

    const recentUpdates = await this.prismaService.connectorStatusUpdate.findMany({
      where: { connectorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: STATUS_UPDATE_WITH_CONNECTOR_SELECT,
    });

    if (recentUpdates.length === 0) {
      return null;
    }

    const now = new Date();
    const updatesWithRecalculatedConfidence = recentUpdates.map((update) => ({
      update,
      confidence: this.recalculateConfidence(update.confidenceScore, update.createdAt, now),
    }));

    updatesWithRecalculatedConfidence.sort((a, b) => b.confidence - a.confidence);

    const mostConfident = updatesWithRecalculatedConfidence[0];

    return {
      confidenceScore: mostConfident.confidence,
      connectorId,
      latestUpdate: mapStatusUpdateWithConnectorRecordToResponse(mostConfident.update),
      status: mostConfident.update.status as StationStatus,
    };
  }

  /**
   * Calculates user reputation based on helpful reviews and verified sessions.
   * Higher reputation means more trustworthy status updates.
   */
  private async calculateUserReputation(userId: string): Promise<number> {
    const [reviewCount, sessionCount] = await Promise.all([
      this.prismaService.review.count({
        where: {
          userId,
          rating: { gte: 4 },
        },
      }),
      this.prismaService.session.count({
        where: {
          userId,
          status: 'COMPLETED',
        },
      }),
    ]);

    const reviewScore = Math.min(reviewCount * 0.1, 0.3);
    const sessionScore = Math.min(sessionCount * 0.05, 0.5);

    return reviewScore + sessionScore;
  }

  /**
   * Calculates initial confidence score for a new status update.
   * Base confidence is 0.5, enhanced by user reputation.
   */
  private calculateInitialConfidence(userReputation: number): number {
    const baseConfidence = 0.5;
    const reputationBonus = userReputation;
    return Math.min(baseConfidence + reputationBonus, 1.0);
  }

  /**
   * Recalculates confidence score based on age of the update.
   * Confidence decays exponentially with time (half-life of 1 hour).
   */
  private recalculateConfidence(initialConfidence: number, createdAt: Date, now: Date): number {
    const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    const halfLifeHours = 1;
    const decayFactor = Math.pow(0.5, ageInHours / halfLifeHours);

    return initialConfidence * decayFactor;
  }

  /** Ensures a user exists before status update operations are executed. */
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: USER_ID_SELECT,
    });

    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }
  }

  /** Ensures a connector exists before status update operations are executed. */
  private async assertConnectorExists(connectorId: string): Promise<void> {
    const connector = await this.prismaService.connector.findUnique({
      where: { id: connectorId },
      select: { id: true },
    });

    if (connector === null) {
      throw new NotFoundException(CONNECTOR_NOT_FOUND_MESSAGE);
    }
  }
}

/** Maps a status update Prisma record to a response payload. */
function mapStatusUpdateRecordToResponse(
  update: StatusUpdateRecord,
): ConnectorStatusUpdateResponse {
  return {
    comment: update.comment,
    confidenceScore: update.confidenceScore,
    connectorId: update.connectorId,
    createdAt: update.createdAt.toISOString(),
    id: update.id,
    status: update.status as StationStatus,
    updatedAt: update.updatedAt.toISOString(),
    userId: update.userId,
  };
}

/** Maps a status update with embedded connector to a response payload. */
function mapStatusUpdateWithConnectorRecordToResponse(
  update: StatusUpdateWithConnectorRecord,
): ConnectorStatusUpdateResponse {
  return {
    comment: update.comment,
    confidenceScore: update.confidenceScore,
    connector: {
      connectorType: update.connector.connectorType,
      evseId: update.connector.evseId,
      id: update.connector.id,
      powerKw: update.connector.powerKw,
      station: {
        address: update.connector.station.address,
        city: update.connector.station.city,
        id: update.connector.station.id,
        name: update.connector.station.name,
      },
    },
    connectorId: update.connectorId,
    createdAt: update.createdAt.toISOString(),
    id: update.id,
    status: update.status as StationStatus,
    updatedAt: update.updatedAt.toISOString(),
    userId: update.userId,
  };
}
