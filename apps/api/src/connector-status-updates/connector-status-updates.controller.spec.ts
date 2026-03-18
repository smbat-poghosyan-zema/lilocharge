import { StationStatus } from '@lilocharge/shared-types';

import { ConnectorStatusUpdatesController } from './connector-status-updates.controller';
import { ConnectorStatusUpdatesService } from './connector-status-updates.service';

describe('ConnectorStatusUpdatesController', () => {
  let controller: ConnectorStatusUpdatesController;
  let service: jest.Mocked<ConnectorStatusUpdatesService>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
  const mockConnectorId = '550e8400-e29b-41d4-a716-446655440001';

  const mockStatusUpdate = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    connectorId: mockConnectorId,
    userId: mockUserId,
    status: StationStatus.AVAILABLE,
    comment: 'Working fine',
    confidenceScore: 0.8,
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
  };

  const mockMostConfidentStatus = {
    connectorId: mockConnectorId,
    status: StationStatus.AVAILABLE,
    confidenceScore: 0.85,
    latestUpdate: mockStatusUpdate,
  };

  beforeEach(() => {
    service = {
      createStatusUpdate: jest.fn(),
      getStatusUpdates: jest.fn(),
      getMostConfidentStatus: jest.fn(),
    } as unknown as jest.Mocked<ConnectorStatusUpdatesService>;

    controller = new ConnectorStatusUpdatesController(service);
  });

  describe('createStatusUpdate', () => {
    it('should create a status update', async () => {
      const dto = {
        connectorId: mockConnectorId,
        status: StationStatus.AVAILABLE,
        comment: 'Working fine',
      };

      service.createStatusUpdate.mockResolvedValue(mockStatusUpdate);

      const result = await controller.createStatusUpdate(mockUserId, dto);

      expect(result).toEqual(mockStatusUpdate);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.createStatusUpdate).toHaveBeenCalledWith(mockUserId, dto);
    });
  });

  describe('getStatusUpdates', () => {
    it('should return status updates with pagination', async () => {
      const query = { page: 1, limit: 20 };
      service.getStatusUpdates.mockResolvedValue([mockStatusUpdate]);

      const result = await controller.getStatusUpdates(query);

      expect(result).toEqual([mockStatusUpdate]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.getStatusUpdates).toHaveBeenCalledWith(query);
    });

    it('should support filtering by connectorId', async () => {
      const query = { connectorId: mockConnectorId };
      service.getStatusUpdates.mockResolvedValue([mockStatusUpdate]);

      const result = await controller.getStatusUpdates(query);

      expect(result).toEqual([mockStatusUpdate]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.getStatusUpdates).toHaveBeenCalledWith(query);
    });
  });

  describe('getMostConfidentStatus', () => {
    it('should return the most confident status update', async () => {
      service.getMostConfidentStatus.mockResolvedValue(mockMostConfidentStatus);

      const result = await controller.getMostConfidentStatus(mockConnectorId);

      expect(result).toEqual(mockMostConfidentStatus);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.getMostConfidentStatus).toHaveBeenCalledWith(mockConnectorId);
    });

    it('should return null when no updates exist', async () => {
      service.getMostConfidentStatus.mockResolvedValue(null);

      const result = await controller.getMostConfidentStatus(mockConnectorId);

      expect(result).toBeNull();
    });
  });
});
