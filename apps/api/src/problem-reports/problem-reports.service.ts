import type {
  CreateProblemReportRequest,
  ListProblemReportsQueryRequest,
  ProblemReportResponse,
  ProblemReportStatus,
  ProblemType,
} from '@lilocharge/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { StationProblemReportEmailInput } from '../mail/mail.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const STATION_NOT_FOUND_MESSAGE = 'Station not found';

const USER_SELECT = {
  displayName: true,
  id: true,
} satisfies Prisma.UserSelect;

const STATION_SELECT = {
  address: true,
  city: true,
  id: true,
  name: true,
  operatorId: true,
  operatorName: true,
} satisfies Prisma.StationSelect;

const PROBLEM_REPORT_SELECT = {
  createdAt: true,
  description: true,
  id: true,
  photos: true,
  problemType: true,
  resolvedAt: true,
  stationId: true,
  status: true,
  userId: true,
} satisfies Prisma.StationProblemReportSelect;

const PROBLEM_REPORT_WITH_STATION_SELECT = {
  createdAt: true,
  description: true,
  id: true,
  photos: true,
  problemType: true,
  resolvedAt: true,
  station: {
    select: {
      address: true,
      city: true,
      id: true,
      name: true,
    },
  },
  stationId: true,
  status: true,
  userId: true,
} satisfies Prisma.StationProblemReportSelect;

type ProblemReportRecord = Prisma.StationProblemReportGetPayload<{
  select: typeof PROBLEM_REPORT_SELECT;
}>;

type ProblemReportWithStationRecord = Prisma.StationProblemReportGetPayload<{
  select: typeof PROBLEM_REPORT_WITH_STATION_SELECT;
}>;

type UserRecord = Prisma.UserGetPayload<{
  select: typeof USER_SELECT;
}>;

type StationRecord = Prisma.StationGetPayload<{
  select: typeof STATION_SELECT;
}>;

/** Service responsible for problem report CRUD operations and operator notification. */
@Injectable()
export class ProblemReportsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Creates a new problem report for a charging station.
   * Sends email notification to the station operator.
   */
  public async createProblemReport(
    userId: string,
    data: CreateProblemReportRequest,
  ): Promise<ProblemReportResponse> {
    const user = await this.findUser(userId);
    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }

    const station = await this.findStation(data.stationId);
    if (station === null) {
      throw new NotFoundException(STATION_NOT_FOUND_MESSAGE);
    }

    const problemReport = await this.prismaService.stationProblemReport.create({
      data: {
        description: data.description,
        photos: data.photos ? [...data.photos] : [],
        problemType: data.problemType,
        stationId: data.stationId,
        userId,
      },
      select: PROBLEM_REPORT_WITH_STATION_SELECT,
    });

    await this.notifyOperator(problemReport, station, user);

    return mapProblemReportWithStationRecordToResponse(problemReport);
  }

  /** Lists problem reports for a specific station with pagination. */
  public async getProblemReportsByStation(
    stationId: string,
    query: ListProblemReportsQueryRequest,
  ): Promise<ProblemReportResponse[]> {
    const station = await this.findStation(stationId);
    if (station === null) {
      throw new NotFoundException(STATION_NOT_FOUND_MESSAGE);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StationProblemReportWhereInput = {
      stationId,
    };

    if (query.status !== undefined) {
      where.status = query.status;
    }

    const problemReports = await this.prismaService.stationProblemReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: PROBLEM_REPORT_SELECT,
    });

    return problemReports.map((report) => mapProblemReportRecordToResponse(report));
  }

  /** Lists problem reports created by a specific user with pagination. */
  public async getProblemReportsByUser(
    userId: string,
    query: ListProblemReportsQueryRequest,
  ): Promise<ProblemReportResponse[]> {
    const user = await this.findUser(userId);
    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.StationProblemReportWhereInput = {
      userId,
    };

    if (query.status !== undefined) {
      where.status = query.status;
    }

    const problemReports = await this.prismaService.stationProblemReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: PROBLEM_REPORT_WITH_STATION_SELECT,
    });

    return problemReports.map((report) => mapProblemReportWithStationRecordToResponse(report));
  }

  /** Finds a user by ID or returns null. */
  private async findUser(userId: string): Promise<UserRecord | null> {
    return this.prismaService.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
  }

  /** Finds a station by ID or returns null. */
  private async findStation(stationId: string): Promise<StationRecord | null> {
    return this.prismaService.station.findUnique({
      where: { id: stationId },
      select: STATION_SELECT,
    });
  }

  /** Sends email notification to station operator about the problem report. */
  private async notifyOperator(
    report: ProblemReportWithStationRecord,
    station: StationRecord,
    user: UserRecord,
  ): Promise<void> {
    const operatorEmail = this.resolveOperatorEmail(station.operatorId);

    if (operatorEmail === null) {
      return;
    }

    const emailInput: StationProblemReportEmailInput = {
      operatorEmail,
      operatorName: station.operatorName,
      stationName: station.name,
      stationAddress: `${station.address}, ${station.city}`,
      problemType: formatProblemType(report.problemType),
      description: report.description,
      reporterName: user.displayName,
      reportedAt: report.createdAt.toISOString(),
    };

    await this.mailService.sendStationProblemReportEmail(emailInput);
  }

  /**
   * Resolves operator email from operator ID.
   * In a real system, this would query an operators table or external service.
   * For now, we use a simple mapping.
   */
  private resolveOperatorEmail(operatorId: string): string | null {
    const operatorEmailMap: Record<string, string> = {
      'evcharge-am': 'operators@evcharge.am',
      'chargepoint-arm': 'support@chargepoint.am',
      'tesla-supercharger': 'armenia@tesla.com',
    };

    return operatorEmailMap[operatorId] ?? null;
  }
}

/** Maps a problem report Prisma record to a response payload. */
function mapProblemReportRecordToResponse(report: ProblemReportRecord): ProblemReportResponse {
  return {
    createdAt: report.createdAt.toISOString(),
    description: report.description,
    id: report.id,
    photos: report.photos,
    problemType: report.problemType as ProblemType,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    stationId: report.stationId,
    status: report.status as ProblemReportStatus,
    userId: report.userId,
  };
}

/** Maps a problem report with embedded station to a response payload. */
function mapProblemReportWithStationRecordToResponse(
  report: ProblemReportWithStationRecord,
): ProblemReportResponse {
  return {
    createdAt: report.createdAt.toISOString(),
    description: report.description,
    id: report.id,
    photos: report.photos,
    problemType: report.problemType as ProblemType,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    station: {
      address: report.station.address,
      city: report.station.city,
      id: report.station.id,
      name: report.station.name,
    },
    stationId: report.stationId,
    status: report.status as ProblemReportStatus,
    userId: report.userId,
  };
}

/** Formats a problem type enum value into a human-readable string. */
function formatProblemType(type: string): string {
  const typeMap: Record<string, string> = {
    OFFLINE: 'Station Offline',
    BROKEN_CONNECTOR: 'Broken Connector',
    NO_POWER: 'No Power',
    PAYMENT_ISSUE: 'Payment Issue',
    PHYSICAL_DAMAGE: 'Physical Damage',
    ACCESS_BLOCKED: 'Access Blocked',
    OTHER: 'Other Issue',
  };

  return typeMap[type] ?? type;
}
