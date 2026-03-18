import { Test, type TestingModule } from '@nestjs/testing';

import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

describe('CacheService', () => {
  let cacheService: CacheService;

  const mockRedisService = {
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    scanKeys: jest.fn(),
    delMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);

    jest.clearAllMocks();
    mockRedisService.scanKeys.mockResolvedValue([]);
    mockRedisService.delMany.mockResolvedValue(undefined);
  });

  describe('cacheNearbyStations', () => {
    it('should cache nearby stations with correct TTL', async () => {
      const cacheKey = 'lat:40.123456|lng:44.654321';
      const data = [{ id: 'station-1', name: 'Station 1' }];

      await cacheService.cacheNearbyStations(cacheKey, data);

      expect(mockRedisService.setEx).toHaveBeenCalledWith(
        `station:nearby:${cacheKey}`,
        300,
        JSON.stringify(data),
      );
    });
  });

  describe('getNearbyStations', () => {
    it('should return cached nearby stations when available', async () => {
      const cacheKey = 'lat:40.123456|lng:44.654321';
      const data = [{ id: 'station-1', name: 'Station 1' }];

      mockRedisService.get.mockResolvedValue(JSON.stringify(data));

      const result = await cacheService.getNearbyStations(cacheKey);

      expect(mockRedisService.get).toHaveBeenCalledWith(`station:nearby:${cacheKey}`);
      expect(result).toEqual(data);
    });

    it('should return null when cache miss', async () => {
      const cacheKey = 'lat:40.123456|lng:44.654321';

      mockRedisService.get.mockResolvedValue(null);

      const result = await cacheService.getNearbyStations(cacheKey);

      expect(result).toBeNull();
    });

    it('should return null when JSON parse fails', async () => {
      const cacheKey = 'lat:40.123456|lng:44.654321';

      mockRedisService.get.mockResolvedValue('invalid json');

      const result = await cacheService.getNearbyStations(cacheKey);

      expect(result).toBeNull();
    });
  });

  describe('cacheStationSearch', () => {
    it('should cache station search results with correct TTL', async () => {
      const cacheKey = 'q:yerevan|lat:40.123456|lng:44.654321';
      const data = [{ id: 'station-1', name: 'Yerevan Station' }];

      await cacheService.cacheStationSearch(cacheKey, data);

      expect(mockRedisService.setEx).toHaveBeenCalledWith(
        `station:search:${cacheKey}`,
        300,
        JSON.stringify(data),
      );
    });
  });

  describe('getStationSearch', () => {
    it('should return cached search results when available', async () => {
      const cacheKey = 'q:yerevan|lat:40.123456|lng:44.654321';
      const data = [{ id: 'station-1', name: 'Yerevan Station' }];

      mockRedisService.get.mockResolvedValue(JSON.stringify(data));

      const result = await cacheService.getStationSearch(cacheKey);

      expect(mockRedisService.get).toHaveBeenCalledWith(`station:search:${cacheKey}`);
      expect(result).toEqual(data);
    });

    it('should return null when cache miss', async () => {
      const cacheKey = 'q:yerevan|lat:40.123456|lng:44.654321';

      mockRedisService.get.mockResolvedValue(null);

      const result = await cacheService.getStationSearch(cacheKey);

      expect(result).toBeNull();
    });
  });

  describe('cacheStationDetail', () => {
    it('should cache station detail with correct TTL', async () => {
      const stationId = 'station-uuid-1';
      const data = { id: stationId, name: 'Station 1', connectors: [] };

      await cacheService.cacheStationDetail(stationId, data);

      expect(mockRedisService.setEx).toHaveBeenCalledWith(
        `station:detail:${stationId}`,
        300,
        JSON.stringify(data),
      );
    });
  });

  describe('getStationDetail', () => {
    it('should return cached station detail when available', async () => {
      const stationId = 'station-uuid-1';
      const data = { id: stationId, name: 'Station 1', connectors: [] };

      mockRedisService.get.mockResolvedValue(JSON.stringify(data));

      const result = await cacheService.getStationDetail(stationId);

      expect(mockRedisService.get).toHaveBeenCalledWith(`station:detail:${stationId}`);
      expect(result).toEqual(data);
    });

    it('should return null when cache miss', async () => {
      const stationId = 'station-uuid-1';

      mockRedisService.get.mockResolvedValue(null);

      const result = await cacheService.getStationDetail(stationId);

      expect(result).toBeNull();
    });
  });

  describe('invalidateStation', () => {
    it('should delete station detail cache', async () => {
      const stationId = 'station-uuid-1';

      await cacheService.invalidateStation(stationId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`station:detail:${stationId}`);
    });

    it('should scan and delete station:nearby:* keys', async () => {
      const stationId = 'station-uuid-1';
      const nearbyKeys = ['station:nearby:key1', 'station:nearby:key2'];
      mockRedisService.scanKeys.mockImplementation((pattern: string) => {
        if (pattern === 'station:nearby:*') return Promise.resolve(nearbyKeys);
        return Promise.resolve([]);
      });

      await cacheService.invalidateStation(stationId);

      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('station:nearby:*');
      expect(mockRedisService.delMany).toHaveBeenCalledWith(nearbyKeys);
    });

    it('should scan and delete station:search:* keys', async () => {
      const stationId = 'station-uuid-1';
      const searchKeys = ['station:search:key1'];
      mockRedisService.scanKeys.mockImplementation((pattern: string) => {
        if (pattern === 'station:search:*') return Promise.resolve(searchKeys);
        return Promise.resolve([]);
      });

      await cacheService.invalidateStation(stationId);

      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('station:search:*');
      expect(mockRedisService.delMany).toHaveBeenCalledWith(searchKeys);
    });

    it('should call delMany with empty arrays when no nearby or search keys exist', async () => {
      const stationId = 'station-uuid-1';
      mockRedisService.scanKeys.mockResolvedValue([]);

      await cacheService.invalidateStation(stationId);

      expect(mockRedisService.delMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('cacheConnectorStatus', () => {
    it('should cache connector status with 30 second TTL', async () => {
      const connectorId = 'connector-uuid-1';
      const data = { id: connectorId, status: 'AVAILABLE' };

      await cacheService.cacheConnectorStatus(connectorId, data);

      expect(mockRedisService.setEx).toHaveBeenCalledWith(
        `connector:status:${connectorId}`,
        30,
        JSON.stringify(data),
      );
    });
  });

  describe('getConnectorStatus', () => {
    it('should return cached connector status when available', async () => {
      const connectorId = 'connector-uuid-1';
      const data = { id: connectorId, status: 'AVAILABLE' };

      mockRedisService.get.mockResolvedValue(JSON.stringify(data));

      const result = await cacheService.getConnectorStatus(connectorId);

      expect(mockRedisService.get).toHaveBeenCalledWith(`connector:status:${connectorId}`);
      expect(result).toEqual(data);
    });

    it('should return null when cache miss', async () => {
      const connectorId = 'connector-uuid-1';

      mockRedisService.get.mockResolvedValue(null);

      const result = await cacheService.getConnectorStatus(connectorId);

      expect(result).toBeNull();
    });
  });

  describe('invalidateConnector', () => {
    it('should delete connector cache and cascade to invalidateStation', async () => {
      const connectorId = 'connector-uuid-1';
      const stationId = 'station-uuid-1';

      await cacheService.invalidateConnector(connectorId, stationId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`connector:status:${connectorId}`);
      expect(mockRedisService.del).toHaveBeenCalledWith(`station:detail:${stationId}`);
    });

    it('should also scan nearby and search keys when cascading to invalidateStation', async () => {
      const connectorId = 'connector-uuid-1';
      const stationId = 'station-uuid-1';

      await cacheService.invalidateConnector(connectorId, stationId);

      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('station:nearby:*');
      expect(mockRedisService.scanKeys).toHaveBeenCalledWith('station:search:*');
    });
  });

  describe('error handling', () => {
    it('should handle setEx errors gracefully', async () => {
      const cacheKey = 'test-key';
      const data = { test: 'data' };

      mockRedisService.setEx.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.cacheNearbyStations(cacheKey, data)).resolves.not.toThrow();
    });

    it('should handle get errors gracefully', async () => {
      const cacheKey = 'test-key';

      mockRedisService.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.getNearbyStations(cacheKey);

      expect(result).toBeNull();
    });
  });
});
