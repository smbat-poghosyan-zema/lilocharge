import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/** Redis client wrapper used for OTP and short-lived auth session storage. */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
    });
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis client error: ${error.message}`);
    });
  }

  /** Connects to Redis when Nest initializes the module. */
  public async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /** Gracefully closes the Redis connection during module shutdown. */
  public async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  /** Retrieves a UTF-8 string value by key. */
  public async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Sets a value with an expiry (in seconds). */
  public async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.setEx(key, ttlSeconds, value);
  }

  /** Deletes a key if it exists. */
  public async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Returns all keys matching a glob pattern. */
  public async scanKeys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  /** Deletes multiple keys in a single call; no-op when the array is empty. */
  public async delMany(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}
