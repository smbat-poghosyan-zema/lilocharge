import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

const STATION_CACHE_TTL_SECONDS = 300; // 5 minutes
const CONNECTOR_CACHE_TTL_SECONDS = 30; // 30 seconds

const STATION_NEARBY_KEY_PREFIX = 'station:nearby:';
const STATION_SEARCH_KEY_PREFIX = 'station:search:';
const STATION_DETAIL_KEY_PREFIX = 'station:detail:';
const CONNECTOR_STATUS_KEY_PREFIX = 'connector:status:';

/**
 * Cache service providing Redis-based caching for stations and connectors.
 *
 * - Station data cached for 5 minutes
 * - Connector status cached for 30 seconds
 * - All cache keys use JSON serialization for complex objects
 */
@Injectable()
export class CacheService {
  private readonly logger: Logger = new Logger(CacheService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Caches nearby stations search results with 5 minute TTL.
   *
   * @param cacheKey - Unique key based on search parameters
   * @param data - Station search results to cache
   */
  public async cacheNearbyStations<T>(cacheKey: string, data: T): Promise<void> {
    const key = `${STATION_NEARBY_KEY_PREFIX}${cacheKey}`;
    await this.setJsonCache(key, data, STATION_CACHE_TTL_SECONDS);
  }

  /**
   * Retrieves cached nearby stations search results.
   *
   * @param cacheKey - Unique key based on search parameters
   * @returns Cached data or null if not found or expired
   */
  public async getNearbyStations<T>(cacheKey: string): Promise<T | null> {
    const key = `${STATION_NEARBY_KEY_PREFIX}${cacheKey}`;
    return this.getJsonCache<T>(key);
  }

  /**
   * Caches station search results with 5 minute TTL.
   *
   * @param cacheKey - Unique key based on search query
   * @param data - Station search results to cache
   */
  public async cacheStationSearch<T>(cacheKey: string, data: T): Promise<void> {
    const key = `${STATION_SEARCH_KEY_PREFIX}${cacheKey}`;
    await this.setJsonCache(key, data, STATION_CACHE_TTL_SECONDS);
  }

  /**
   * Retrieves cached station search results.
   *
   * @param cacheKey - Unique key based on search query
   * @returns Cached data or null if not found or expired
   */
  public async getStationSearch<T>(cacheKey: string): Promise<T | null> {
    const key = `${STATION_SEARCH_KEY_PREFIX}${cacheKey}`;
    return this.getJsonCache<T>(key);
  }

  /**
   * Caches station detail with 5 minute TTL.
   *
   * @param stationId - Station UUID
   * @param data - Station detail response to cache
   */
  public async cacheStationDetail<T>(stationId: string, data: T): Promise<void> {
    const key = `${STATION_DETAIL_KEY_PREFIX}${stationId}`;
    await this.setJsonCache(key, data, STATION_CACHE_TTL_SECONDS);
  }

  /**
   * Retrieves cached station detail.
   *
   * @param stationId - Station UUID
   * @returns Cached data or null if not found or expired
   */
  public async getStationDetail<T>(stationId: string): Promise<T | null> {
    const key = `${STATION_DETAIL_KEY_PREFIX}${stationId}`;
    return this.getJsonCache<T>(key);
  }

  /**
   * Invalidates all cached data for a specific station, including nearby and search caches.
   *
   * @param stationId - Station UUID
   */
  public async invalidateStation(stationId: string): Promise<void> {
    const detailKey = `${STATION_DETAIL_KEY_PREFIX}${stationId}`;
    await this.redisService.del(detailKey);

    const [nearbyKeys, searchKeys] = await Promise.all([
      this.redisService.scanKeys(`${STATION_NEARBY_KEY_PREFIX}*`),
      this.redisService.scanKeys(`${STATION_SEARCH_KEY_PREFIX}*`),
    ]);

    await Promise.all([
      this.redisService.delMany(nearbyKeys),
      this.redisService.delMany(searchKeys),
    ]);

    this.logger.debug(
      `Invalidated station cache: ${stationId} (nearby: ${nearbyKeys.length}, search: ${searchKeys.length})`,
    );
  }

  /**
   * Caches connector status with 30 second TTL.
   *
   * @param connectorId - Connector UUID
   * @param data - Connector response to cache
   */
  public async cacheConnectorStatus<T>(connectorId: string, data: T): Promise<void> {
    const key = `${CONNECTOR_STATUS_KEY_PREFIX}${connectorId}`;
    await this.setJsonCache(key, data, CONNECTOR_CACHE_TTL_SECONDS);
  }

  /**
   * Retrieves cached connector status.
   *
   * @param connectorId - Connector UUID
   * @returns Cached data or null if not found or expired
   */
  public async getConnectorStatus<T>(connectorId: string): Promise<T | null> {
    const key = `${CONNECTOR_STATUS_KEY_PREFIX}${connectorId}`;
    return this.getJsonCache<T>(key);
  }

  /**
   * Invalidates cached connector status and related station data.
   *
   * @param connectorId - Connector UUID
   * @param stationId - Station UUID to invalidate
   */
  public async invalidateConnector(connectorId: string, stationId: string): Promise<void> {
    const connectorKey = `${CONNECTOR_STATUS_KEY_PREFIX}${connectorId}`;
    await this.redisService.del(connectorKey);
    await this.invalidateStation(stationId);
    this.logger.debug(`Invalidated connector cache: ${connectorId}`);
  }

  /**
   * Stores JSON-serialized data in Redis with TTL.
   *
   * @param key - Redis key
   * @param data - Data to serialize and cache
   * @param ttlSeconds - Time-to-live in seconds
   */
  private async setJsonCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(data);
      await this.redisService.setEx(key, ttlSeconds, serialized);
    } catch (error) {
      this.logger.error(`Failed to cache data for key ${key}: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieves and deserializes JSON data from Redis.
   *
   * @param key - Redis key
   * @returns Deserialized data or null if not found or invalid
   */
  private async getJsonCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redisService.get(key);

      if (cached === null) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      this.logger.error(`Failed to retrieve cache for key ${key}: ${(error as Error).message}`);
      return null;
    }
  }
}
