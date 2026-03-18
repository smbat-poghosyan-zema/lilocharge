import { NotFoundException } from '@nestjs/common';
import type { StationStatus } from '@lilocharge/shared-types';

import type { PrismaService } from '../prisma/prisma.service';
import { ConnectorStatusUpdatesService } from './connector-status-updates.service';

interface StatusUpdateRecord {
  readonly comment: string | null;
  readonly confidenceScore: number;
  readonly connectorId: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly status: string;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface StatusUpdateWithConnectorRecord {
  readonly comment: string | null;
  readonly confidenceScore: number;
  readonly connector: {
    readonly connectorType: string;
    readonly evseId: string;
    readonly id: string;
    readonly powerKw: number;
    readonly station: {
      readonly address: string;
      readonly city: string;
      readonly id: string;
      readonly name: string;
    };
  };
  readonly connectorId: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly status: string;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
}

interface PrismaConnectorDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
}

interface PrismaReviewDelegateMock {
  readonly count: jest.Mock<Promise<number>, [unknown]>;
}

interface PrismaSessionDelegateMock {
  readonly count: jest.Mock<Promise<number>, [unknown]>;
}

interface PrismaStatusUpdateDelegateMock {
  readonly create: jest.Mock<Promise<StatusUpdateWithConnectorRecord>, [unknown]>;
  readonly findMany: jest.Mock<
    Promise<StatusUpdateRecord[] | StatusUpdateWithConnectorRecord[]>,
    [unknown]
  >;
}

interface PrismaServiceMock {
  readonly connectorStatusUpdate: PrismaStatusUpdateDelegateMock;
  readonly connector: PrismaConnectorDelegateMock;
  readonly review: PrismaReviewDelegateMock;
  readonly session: PrismaSessionDelegateMock;
  readonly user: PrismaUserDelegateMock;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';
const STATUS_UPDATE_ID = '33333333-3333-3333-3333-333333333333';

describe('ConnectorStatusUpdatesService', () => {
  let service: ConnectorStatusUpdatesService;
  let prismaService: PrismaServiceMock;

  beforeEach(() => {
    prismaService = {
      user: {
        findUnique: jest.fn() as jest.Mock<Promise<{ id: string } | null>, [unknown]>,
      },
      connector: {
        findUnique: jest.fn() as jest.Mock<Promise<{ id: string } | null>, [unknown]>,
      },
      review: {
        count: jest.fn() as jest.Mock<Promise<number>, [unknown]>,
      },
      session: {
        count: jest.fn() as jest.Mock<Promise<number>, [unknown]>,
      },
      connectorStatusUpdate: {
        create: jest.fn() as jest.Mock<Promise<StatusUpdateWithConnectorRecord>, [unknown]>,
        findMany: jest.fn() as jest.Mock<
          Promise<StatusUpdateRecord[] | StatusUpdateWithConnectorRecord[]>,
          [unknown]
        >,
      },
    };

    service = new ConnectorStatusUpdatesService(prismaService as unknown as PrismaService);
  });

  describe('createStatusUpdate', () => {
    it('should create a status update with confidence score', async () => {
      const statusData = {
        connectorId: CONNECTOR_ID,
        status: 'AVAILABLE' as StationStatus,
        comment: 'Working fine',
      };

      prismaService.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaService.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });
      prismaService.review.count.mockResolvedValue(5);
      prismaService.session.count.mockResolvedValue(10);

      const mockStatusUpdate: StatusUpdateWithConnectorRecord = {
        id: STATUS_UPDATE_ID,
        connectorId: CONNECTOR_ID,
        userId: USER_ID,
        status: 'AVAILABLE',
        comment: 'Working fine',
        confidenceScore: 0.8,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-01T12:00:00Z'),
        connector: {
          id: CONNECTOR_ID,
          evseId: 'EVSE-001',
          connectorType: 'TYPE_2',
          powerKw: 50,
          station: {
            id: 'station-id',
            name: 'Station 1',
            address: '123 Main St',
            city: 'Yerevan',
          },
        },
      };

      prismaService.connectorStatusUpdate.create.mockResolvedValue(mockStatusUpdate);

      const result = await service.createStatusUpdate(USER_ID, statusData);

      expect(result).toEqual({
        id: STATUS_UPDATE_ID,
        connectorId: CONNECTOR_ID,
        userId: USER_ID,
        status: 'AVAILABLE',
        comment: 'Working fine',
        confidenceScore: 0.8,
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
        connector: {
          id: CONNECTOR_ID,
          evseId: 'EVSE-001',
          connectorType: 'TYPE_2',
          powerKw: 50,
          station: {
            id: 'station-id',
            name: 'Station 1',
            address: '123 Main St',
            city: 'Yerevan',
          },
        },
      });

      expect(prismaService.review.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, rating: { gte: 4 } },
      });
      expect(prismaService.session.count).toHaveBeenCalledWith({
        where: { userId: USER_ID, status: 'COMPLETED' },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createStatusUpdate(USER_ID, {
          connectorId: CONNECTOR_ID,
          status: 'AVAILABLE' as StationStatus,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if connector does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaService.connector.findUnique.mockResolvedValue(null);

      await expect(
        service.createStatusUpdate(USER_ID, {
          connectorId: CONNECTOR_ID,
          status: 'AVAILABLE' as StationStatus,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatusUpdates', () => {
    it('should return paginated status updates', async () => {
      const mockUpdates: StatusUpdateRecord[] = [
        {
          id: STATUS_UPDATE_ID,
          connectorId: CONNECTOR_ID,
          userId: USER_ID,
          status: 'AVAILABLE',
          comment: 'Works',
          confidenceScore: 0.8,
          createdAt: new Date('2024-01-01T12:00:00Z'),
          updatedAt: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      prismaService.connectorStatusUpdate.findMany.mockResolvedValue(mockUpdates);

      const result = await service.getStatusUpdates({ page: 1, limit: 20 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: STATUS_UPDATE_ID,
        status: 'AVAILABLE',
      });
    });

    it('should filter by connectorId when provided', async () => {
      prismaService.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });
      prismaService.connectorStatusUpdate.findMany.mockResolvedValue([]);

      await service.getStatusUpdates({ connectorId: CONNECTOR_ID });

      expect(prismaService.connector.findUnique).toHaveBeenCalledWith({
        where: { id: CONNECTOR_ID },
        select: { id: true },
      });
    });

    it('should filter by userId when provided', async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaService.connectorStatusUpdate.findMany.mockResolvedValue([]);

      await service.getStatusUpdates({ userId: USER_ID });

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { id: true },
      });
    });
  });

  describe('getMostConfidentStatus', () => {
    it('should return the most confident status update', async () => {
      prismaService.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });

      const oneHourAgo = new Date('2024-01-01T12:00:00Z');

      const mockUpdates: StatusUpdateWithConnectorRecord[] = [
        {
          id: STATUS_UPDATE_ID,
          connectorId: CONNECTOR_ID,
          userId: USER_ID,
          status: 'AVAILABLE',
          comment: 'Recent update',
          confidenceScore: 0.9,
          createdAt: oneHourAgo,
          updatedAt: oneHourAgo,
          connector: {
            id: CONNECTOR_ID,
            evseId: 'EVSE-001',
            connectorType: 'TYPE_2',
            powerKw: 50,
            station: {
              id: 'station-id',
              name: 'Station 1',
              address: '123 Main St',
              city: 'Yerevan',
            },
          },
        },
      ];

      prismaService.connectorStatusUpdate.findMany.mockResolvedValue(mockUpdates);

      const result = await service.getMostConfidentStatus(CONNECTOR_ID);

      expect(result).toBeDefined();
      expect(result?.connectorId).toBe(CONNECTOR_ID);
      expect(result?.status).toBe('AVAILABLE');
      expect(result?.confidenceScore).toBeLessThanOrEqual(0.9);
    });

    it('should return null if no updates exist', async () => {
      prismaService.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });
      prismaService.connectorStatusUpdate.findMany.mockResolvedValue([]);

      const result = await service.getMostConfidentStatus(CONNECTOR_ID);

      expect(result).toBeNull();
    });

    it('should throw NotFoundException if connector does not exist', async () => {
      prismaService.connector.findUnique.mockResolvedValue(null);

      await expect(service.getMostConfidentStatus(CONNECTOR_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confidence scoring algorithm', () => {
    it('should calculate higher confidence for users with good reputation', async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaService.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });

      prismaService.review.count.mockResolvedValue(10);
      prismaService.session.count.mockResolvedValue(20);

      const mockStatusUpdate: StatusUpdateWithConnectorRecord = {
        id: STATUS_UPDATE_ID,
        connectorId: CONNECTOR_ID,
        userId: USER_ID,
        status: 'AVAILABLE',
        comment: null,
        confidenceScore: 1.0,
        createdAt: new Date(),
        updatedAt: new Date(),
        connector: {
          id: CONNECTOR_ID,
          evseId: 'EVSE-001',
          connectorType: 'TYPE_2',
          powerKw: 50,
          station: {
            id: 'station-id',
            name: 'Station 1',
            address: '123 Main St',
            city: 'Yerevan',
          },
        },
      };

      prismaService.connectorStatusUpdate.create.mockResolvedValue(mockStatusUpdate);

      const result = await service.createStatusUpdate(USER_ID, {
        connectorId: CONNECTOR_ID,
        status: 'AVAILABLE' as StationStatus,
      });

      expect(result.confidenceScore).toBeGreaterThan(0.5);
    });

    it('should calculate lower confidence for new users', async () => {
      prismaService.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaService.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });

      prismaService.review.count.mockResolvedValue(0);
      prismaService.session.count.mockResolvedValue(0);

      const mockStatusUpdate: StatusUpdateWithConnectorRecord = {
        id: STATUS_UPDATE_ID,
        connectorId: CONNECTOR_ID,
        userId: USER_ID,
        status: 'AVAILABLE',
        comment: null,
        confidenceScore: 0.5,
        createdAt: new Date(),
        updatedAt: new Date(),
        connector: {
          id: CONNECTOR_ID,
          evseId: 'EVSE-001',
          connectorType: 'TYPE_2',
          powerKw: 50,
          station: {
            id: 'station-id',
            name: 'Station 1',
            address: '123 Main St',
            city: 'Yerevan',
          },
        },
      };

      prismaService.connectorStatusUpdate.create.mockResolvedValue(mockStatusUpdate);

      const result = await service.createStatusUpdate(USER_ID, {
        connectorId: CONNECTOR_ID,
        status: 'AVAILABLE' as StationStatus,
      });

      expect(result.confidenceScore).toBe(0.5);
    });
  });
});
