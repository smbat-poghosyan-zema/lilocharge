import { ProblemReportStatus, ProblemType } from '@lilocharge/shared-types';

import { ProblemReportsController } from './problem-reports.controller';
import { ProblemReportsService } from './problem-reports.service';

describe('ProblemReportsController', () => {
  let controller: ProblemReportsController;
  let service: jest.Mocked<ProblemReportsService>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
  const mockStationId = '550e8400-e29b-41d4-a716-446655440001';

  const mockProblemReport = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    stationId: mockStationId,
    userId: mockUserId,
    problemType: ProblemType.OFFLINE,
    description: 'Station not responding',
    photos: [],
    status: ProblemReportStatus.PENDING,
    createdAt: '2026-01-01T10:00:00Z',
    resolvedAt: null,
  };

  beforeEach(() => {
    service = {
      createProblemReport: jest.fn(),
      getProblemReportsByStation: jest.fn(),
      getProblemReportsByUser: jest.fn(),
    } as unknown as jest.Mocked<ProblemReportsService>;

    controller = new ProblemReportsController(service);
  });

  describe('createProblemReport', () => {
    it('should create a problem report', async () => {
      const dto = {
        stationId: mockStationId,
        problemType: ProblemType.OFFLINE,
        description: 'Station not responding',
      };

      service.createProblemReport.mockResolvedValue(mockProblemReport);

      const result = await controller.createProblemReport(mockUserId, dto);

      expect(result).toEqual(mockProblemReport);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.createProblemReport).toHaveBeenCalledWith(mockUserId, dto);
    });
  });

  describe('getProblemReportsByStation', () => {
    it('should return problem reports for a station', async () => {
      const query = { page: 1, limit: 20 };
      service.getProblemReportsByStation.mockResolvedValue([mockProblemReport]);

      const result = await controller.getProblemReportsByStation(mockStationId, query);

      expect(result).toEqual([mockProblemReport]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.getProblemReportsByStation).toHaveBeenCalledWith(mockStationId, query);
    });
  });

  describe('getProblemReportsByUser', () => {
    it('should return problem reports created by a user', async () => {
      const query = { page: 1, limit: 20 };
      service.getProblemReportsByUser.mockResolvedValue([mockProblemReport]);

      const result = await controller.getProblemReportsByUser(mockUserId, query);

      expect(result).toEqual([mockProblemReport]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.getProblemReportsByUser).toHaveBeenCalledWith(mockUserId, query);
    });
  });
});
