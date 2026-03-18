import { ProblemReportStatus, ProblemType } from '@lilocharge/shared-types';
import { NotFoundException } from '@nestjs/common';

import type { StationProblemReportEmailInput } from '../mail/mail.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ProblemReportsService } from './problem-reports.service';

interface ProblemReportRecord {
  readonly createdAt: Date;
  readonly description: string;
  readonly id: string;
  readonly photos: readonly string[];
  readonly problemType: string;
  readonly resolvedAt: Date | null;
  readonly stationId: string;
  readonly status: string;
  readonly userId: string;
}

interface ProblemReportWithStationRecord {
  readonly createdAt: Date;
  readonly description: string;
  readonly id: string;
  readonly photos: readonly string[];
  readonly problemType: string;
  readonly resolvedAt: Date | null;
  readonly station: {
    readonly address: string;
    readonly city: string;
    readonly id: string;
    readonly name: string;
  };
  readonly stationId: string;
  readonly status: string;
  readonly userId: string;
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string; displayName: string } | null>, [unknown]>;
}

interface PrismaStationDelegateMock {
  readonly findUnique: jest.Mock<
    Promise<{
      id: string;
      name: string;
      address: string;
      city: string;
      operatorId: string;
      operatorName: string;
    } | null>,
    [unknown]
  >;
}

interface PrismaStationProblemReportDelegateMock {
  readonly create: jest.Mock<Promise<ProblemReportWithStationRecord>, [unknown]>;
  readonly findMany: jest.Mock<
    Promise<ProblemReportRecord[] | ProblemReportWithStationRecord[]>,
    [unknown]
  >;
}

interface PrismaServiceMock {
  readonly stationProblemReport: PrismaStationProblemReportDelegateMock;
  readonly station: PrismaStationDelegateMock;
  readonly user: PrismaUserDelegateMock;
}

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const STATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const REPORT_ID = '550e8400-e29b-41d4-a716-446655440002';

describe('ProblemReportsService', () => {
  let service: ProblemReportsService;
  let prismaService: PrismaServiceMock;
  let mailService: jest.Mocked<MailService>;

  const mockUser = {
    id: USER_ID,
    displayName: 'John Doe',
  };

  const mockStation = {
    id: STATION_ID,
    name: 'Central Station',
    address: 'Yerevan, Baghramyan 1',
    city: 'Yerevan',
    operatorId: 'evcharge-am',
    operatorName: 'EVCharge Armenia',
  };

  const mockProblemReport: ProblemReportRecord = {
    id: REPORT_ID,
    stationId: STATION_ID,
    userId: USER_ID,
    problemType: 'OFFLINE',
    description: 'Station not responding',
    photos: [],
    status: 'PENDING',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    resolvedAt: null,
  };

  beforeEach(() => {
    prismaService = {
      user: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        findUnique: jest.fn(),
      },
      station: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        findUnique: jest.fn(),
      },
      stationProblemReport: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        findMany: jest.fn(),
      },
    } as PrismaServiceMock;

    mailService = {
      sendStationProblemReportEmail: jest.fn(),
    } as unknown as jest.Mocked<MailService>;

    service = new ProblemReportsService(prismaService as unknown as PrismaService, mailService);
  });

  describe('createProblemReport', () => {
    it('should create a problem report and send email notification', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.station.findUnique.mockResolvedValue(mockStation);
      prismaService.stationProblemReport.create.mockResolvedValue({
        ...mockProblemReport,
        station: {
          id: mockStation.id,
          name: mockStation.name,
          address: mockStation.address,
          city: mockStation.city,
        },
      });

      const request = {
        stationId: mockStation.id,
        problemType: ProblemType.OFFLINE,
        description: 'Station not responding',
      };

      const result = await service.createProblemReport(mockUser.id, request);

      expect(result).toMatchObject({
        id: mockProblemReport.id,
        stationId: STATION_ID,
        userId: USER_ID,
        problemType: ProblemType.OFFLINE,
        description: 'Station not responding',
        status: ProblemReportStatus.PENDING,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mailService.sendStationProblemReportEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorEmail: 'operators@evcharge.am',
          operatorName: mockStation.operatorName,
          stationName: mockStation.name,
          problemType: 'Station Offline',
          description: 'Station not responding',
          reporterName: mockUser.displayName,
        } as StationProblemReportEmailInput),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      const request = {
        stationId: mockStation.id,
        problemType: ProblemType.OFFLINE,
        description: 'Station not responding',
      };

      await expect(service.createProblemReport(mockUser.id, request)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when station does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.station.findUnique.mockResolvedValue(null);

      const request = {
        stationId: mockStation.id,
        problemType: ProblemType.OFFLINE,
        description: 'Station not responding',
      };

      await expect(service.createProblemReport(mockUser.id, request)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProblemReportsByStation', () => {
    it('should return problem reports for a station', async () => {
      prismaService.station.findUnique.mockResolvedValue(mockStation);
      prismaService.stationProblemReport.findMany.mockResolvedValue([mockProblemReport]);

      const result = await service.getProblemReportsByStation(mockStation.id, {});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mockProblemReport.id,
        stationId: STATION_ID,
        problemType: ProblemType.OFFLINE,
      });
    });

    it('should filter by status when provided', async () => {
      prismaService.station.findUnique.mockResolvedValue(mockStation);
      prismaService.stationProblemReport.findMany.mockResolvedValue([]);

      await service.getProblemReportsByStation(mockStation.id, {
        status: ProblemReportStatus.RESOLVED,
      });

      expect(prismaService.stationProblemReport.findMany).toHaveBeenCalled();
    });

    it('should throw NotFoundException when station does not exist', async () => {
      prismaService.station.findUnique.mockResolvedValue(null);

      await expect(service.getProblemReportsByStation(mockStation.id, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProblemReportsByUser', () => {
    it('should return problem reports created by a user', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      prismaService.stationProblemReport.findMany.mockResolvedValue([
        {
          ...mockProblemReport,
          station: {
            id: mockStation.id,
            name: mockStation.name,
            address: mockStation.address,
            city: mockStation.city,
          },
        },
      ]);

      const result = await service.getProblemReportsByUser(mockUser.id, {});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mockProblemReport.id,
        userId: USER_ID,
        station: {
          id: mockStation.id,
          name: mockStation.name,
        },
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getProblemReportsByUser(mockUser.id, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
