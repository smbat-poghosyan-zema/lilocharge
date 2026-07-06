import { randomBytes } from 'node:crypto';

import { Injectable, Logger, Optional } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

/**
 * OCPP 1.6 idTag values are CiString20Type: at most 20 printable characters. User ids are
 * 36-character UUIDs, so they can never travel as idTags — strict-mode schema validation
 * (and real chargers) reject them. This service issues short opaque tokens instead.
 */
export const OCPP_ID_TAG_LENGTH = 20;

/** Default lifetime of one issued idTag: long enough to cover any realistic charging session. */
export const DEFAULT_ID_TAG_TTL_SECONDS = 24 * 60 * 60;

const ID_TAG_KEY_PREFIX = 'ocpp:idtag:';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal key-value contract required for idTag persistence (satisfied by RedisService). */
export interface OcppIdTagStore {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<void>;
}

/**
 * Issues and resolves protocol-conformant OCPP idTags mapped to LiloCharge user ids.
 *
 * Tokens are stored in Redis so any API replica (and a restarted process) can resolve a tag
 * echoed back by a charge point in StartTransaction/Authorize. When Redis is unavailable the
 * service degrades to in-memory storage, mirroring OcppRemoteStartService's tracking fallback.
 */
@Injectable()
export class OcppIdTagService {
  private readonly logger: Logger = new Logger(OcppIdTagService.name);
  private readonly store: OcppIdTagStore;

  constructor(@Optional() redisService?: RedisService) {
    this.store = redisService ?? new InMemoryIdTagStore();

    if (redisService === undefined) {
      this.logger.warn(
        'RedisService unavailable; OCPP idTags fall back to in-memory storage (tags are lost on restart)',
      );
    }
  }

  /** Issues one 20-character idTag bound to the given user id. */
  public async issueIdTag(
    userId: string,
    ttlSeconds: number = DEFAULT_ID_TAG_TTL_SECONDS,
  ): Promise<string> {
    const idTag = randomBytes(OCPP_ID_TAG_LENGTH / 2).toString('hex');
    await this.store.setEx(`${ID_TAG_KEY_PREFIX}${idTag}`, ttlSeconds, userId);

    return idTag;
  }

  /**
   * Resolves the user id bound to one idTag.
   *
   * Full UUIDs are also accepted and returned as-is for direct service-level callers (unit
   * tests, internal tooling): a UUID can never arrive through the protocol layer because it
   * exceeds the 20-character idTag schema limit.
   */
  public async resolveUserId(idTag: string): Promise<string | null> {
    const normalized = idTag.trim();

    if (UUID_PATTERN.test(normalized)) {
      return normalized.toLowerCase();
    }

    if (normalized.length === 0 || normalized.length > OCPP_ID_TAG_LENGTH) {
      return null;
    }

    return this.store.get(`${ID_TAG_KEY_PREFIX}${normalized}`);
  }
}

/** Process-local idTag store used when Redis is not available. */
class InMemoryIdTagStore implements OcppIdTagStore {
  private readonly entries: Map<string, { expiresAtMs: number; value: string }> = new Map();

  /** Returns one stored value unless it has expired. */
  public get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);

    if (entry === undefined || entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key);

      return Promise.resolve(null);
    }

    return Promise.resolve(entry.value);
  }

  /** Stores one value with a TTL. */
  public setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.entries.set(key, { expiresAtMs: Date.now() + ttlSeconds * 1000, value });

    return Promise.resolve();
  }
}
