import { MMKV } from 'react-native-mmkv';

import type { ApiResponseContext, ApiResponseInterceptor } from './api-client';

export interface CacheEntry<TData = unknown> {
  readonly data: TData;
  readonly expiresAt: number;
  readonly key: string;
}

export interface CacheConfig {
  readonly defaultTtlMs?: number;
  readonly enabled?: boolean;
  readonly storage?: MMKV;
}

export interface CacheOptions {
  readonly ttlMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY_PREFIX = 'api_cache:';

/**
 * Creates the default MMKV storage instance backing the shared API response cache.
 */
export function createApiCacheStorage(): MMKV {
  return new MMKV({ id: 'api-cache' });
}

/**
 * Creates a cache interceptor that stores API responses in MMKV storage.
 */
export function createCacheInterceptor(config: CacheConfig = {}): ApiResponseInterceptor {
  const storage = config.storage ?? new MMKV({ id: 'api-cache' });
  const defaultTtlMs = config.defaultTtlMs ?? DEFAULT_TTL_MS;
  const enabled = config.enabled ?? true;

  return (context: ApiResponseContext<unknown>): ApiResponseContext<unknown> => {
    if (!enabled || context.request.method !== 'GET') {
      return context;
    }

    const cacheKey = buildCacheKey(context.request.path, context.request.url);
    const ttlMs = extractTtlFromHeaders(context.response.headers) ?? defaultTtlMs;

    if (ttlMs > 0) {
      const entry: CacheEntry = {
        data: context.data,
        expiresAt: Date.now() + ttlMs,
        key: cacheKey,
      };

      storage.set(cacheKey, JSON.stringify(entry));
    }

    return context;
  };
}

/**
 * Retrieves cached response data if available and not expired.
 */
export function getCachedResponse<TData = unknown>(
  path: string,
  url: string,
  storage: MMKV = new MMKV({ id: 'api-cache' }),
): TData | null {
  const cacheKey = buildCacheKey(path, url);
  const rawEntry = storage.getString(cacheKey);

  if (!rawEntry) {
    return null;
  }

  try {
    const entry = JSON.parse(rawEntry) as CacheEntry<TData>;

    if (Date.now() > entry.expiresAt) {
      storage.delete(cacheKey);
      return null;
    }

    return entry.data;
  } catch {
    storage.delete(cacheKey);
    return null;
  }
}

/**
 * Invalidates cached entries matching a path pattern.
 */
export function invalidateCache(
  pathPattern: string | RegExp,
  storage: MMKV = new MMKV({ id: 'api-cache' }),
): number {
  const allKeys = storage.getAllKeys();
  const pattern = typeof pathPattern === 'string' ? new RegExp(pathPattern) : pathPattern;
  let deletedCount = 0;

  for (const key of allKeys) {
    if (!key.startsWith(CACHE_KEY_PREFIX)) {
      continue;
    }

    const path = key.substring(CACHE_KEY_PREFIX.length);

    if (pattern.test(path)) {
      storage.delete(key);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Clears all cached API responses.
 */
export function clearCache(storage: MMKV = new MMKV({ id: 'api-cache' })): void {
  const allKeys = storage.getAllKeys();

  for (const key of allKeys) {
    if (key.startsWith(CACHE_KEY_PREFIX)) {
      storage.delete(key);
    }
  }
}

/**
 * Returns cache statistics for monitoring.
 */
export function getCacheStats(storage: MMKV = new MMKV({ id: 'api-cache' })): {
  readonly entryCount: number;
  readonly expiredCount: number;
} {
  const allKeys = storage.getAllKeys();
  let entryCount = 0;
  let expiredCount = 0;
  const now = Date.now();

  for (const key of allKeys) {
    if (!key.startsWith(CACHE_KEY_PREFIX)) {
      continue;
    }

    entryCount++;
    const rawEntry = storage.getString(key);

    if (!rawEntry) {
      continue;
    }

    try {
      const entry = JSON.parse(rawEntry) as CacheEntry;

      if (now > entry.expiresAt) {
        expiredCount++;
      }
    } catch {
      expiredCount++;
    }
  }

  return {
    entryCount,
    expiredCount,
  };
}

/**
 * Builds a stable cache key from request path and URL.
 */
function buildCacheKey(path: string, url: string): string {
  const urlObj = new URL(url);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const searchParams = urlObj.searchParams.toString();
  const cacheKeyBase = searchParams ? `${normalizedPath}?${searchParams}` : normalizedPath;

  return `${CACHE_KEY_PREFIX}${cacheKeyBase}`;
}

/**
 * Extracts cache TTL from response headers (Cache-Control or custom header).
 */
function extractTtlFromHeaders(headers: Headers): number | null {
  const cacheControl = headers.get('cache-control');

  if (cacheControl) {
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);

    if (maxAgeMatch) {
      return parseInt(maxAgeMatch[1], 10) * 1000;
    }
  }

  const customTtl = headers.get('x-cache-ttl');

  if (customTtl) {
    const ttlSeconds = parseInt(customTtl, 10);

    if (!isNaN(ttlSeconds)) {
      return ttlSeconds * 1000;
    }
  }

  return null;
}
