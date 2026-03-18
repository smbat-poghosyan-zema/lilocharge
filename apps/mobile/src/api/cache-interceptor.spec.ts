import { MMKV } from 'react-native-mmkv';

import type { ApiResponseContext } from './api-client';
import {
  clearCache,
  createCacheInterceptor,
  getCachedResponse,
  getCacheStats,
  invalidateCache,
} from './cache-interceptor';

jest.mock('react-native-mmkv', () => {
  return {
    MMKV: jest.fn().mockImplementation(() => {
      const storage = new Map<string, string>();

      return {
        clearAll: jest.fn(() => {
          storage.clear();
        }),
        delete: jest.fn((key: string) => {
          storage.delete(key);
        }),
        getAllKeys: jest.fn(() => Array.from(storage.keys())),
        getString: jest.fn((key: string) => storage.get(key)),
        set: jest.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
      };
    }),
  };
});

describe('createCacheInterceptor', () => {
  let storage: MMKV;

  beforeEach(() => {
    storage = new MMKV({ id: 'test-api-cache' });
    storage.clearAll();
  });

  afterEach(() => {
    storage.clearAll();
  });

  it('caches GET responses', () => {
    const interceptor = createCacheInterceptor({ storage });
    const context: ApiResponseContext = {
      data: { test: 'value' },
      request: {
        headers: {},
        method: 'GET',
        path: '/test',
        url: 'https://api.example.com/test',
      },
      response: new Response('{}', {
        headers: { 'cache-control': 'max-age=300' },
      }),
    };

    void interceptor(context);

    const cached = getCachedResponse('/test', 'https://api.example.com/test', storage);
    expect(cached).toEqual({ test: 'value' });
  });

  it('does not cache non-GET requests', () => {
    const interceptor = createCacheInterceptor({ storage });
    const context: ApiResponseContext = {
      data: { test: 'value' },
      request: {
        headers: {},
        method: 'POST',
        path: '/test',
        url: 'https://api.example.com/test',
      },
      response: new Response('{}'),
    };

    void interceptor(context);

    const cached = getCachedResponse('/test', 'https://api.example.com/test', storage);
    expect(cached).toBeNull();
  });

  it('uses custom TTL from headers', () => {
    const interceptor = createCacheInterceptor({ defaultTtlMs: 1000, storage });
    const context: ApiResponseContext = {
      data: { test: 'value' },
      request: {
        headers: {},
        method: 'GET',
        path: '/test',
        url: 'https://api.example.com/test',
      },
      response: new Response('{}', {
        headers: { 'x-cache-ttl': '600' },
      }),
    };

    void interceptor(context);

    const allKeys = storage.getAllKeys();
    const cacheKey = allKeys.find((key) => key.includes('/test'));
    const rawEntry = cacheKey ? storage.getString(cacheKey) : null;

    expect(rawEntry).toBeTruthy();

    if (rawEntry) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const entry = JSON.parse(rawEntry);
      const expectedExpiry = Date.now() + 600 * 1000;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(entry.expiresAt).toBeGreaterThan(Date.now());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(entry.expiresAt).toBeLessThanOrEqual(expectedExpiry + 100);
    }
  });

  it('can be disabled', () => {
    const interceptor = createCacheInterceptor({ enabled: false, storage });
    const context: ApiResponseContext = {
      data: { test: 'value' },
      request: {
        headers: {},
        method: 'GET',
        path: '/test',
        url: 'https://api.example.com/test',
      },
      response: new Response('{}', {
        headers: { 'cache-control': 'max-age=300' },
      }),
    };

    void interceptor(context);

    const cached = getCachedResponse('/test', 'https://api.example.com/test', storage);
    expect(cached).toBeNull();
  });
});

describe('getCachedResponse', () => {
  let storage: MMKV;

  beforeEach(() => {
    storage = new MMKV({ id: 'test-api-cache' });
    storage.clearAll();
  });

  afterEach(() => {
    storage.clearAll();
  });

  it('returns cached data when valid', () => {
    const cacheKey = 'api_cache:/test';
    storage.set(
      cacheKey,
      JSON.stringify({
        data: { value: 123 },
        expiresAt: Date.now() + 10000,
        key: cacheKey,
      }),
    );

    const result = getCachedResponse('/test', 'https://api.example.com/test', storage);
    expect(result).toEqual({ value: 123 });
  });

  it('returns null when cache is expired', () => {
    const cacheKey = 'api_cache:/test';
    storage.set(
      cacheKey,
      JSON.stringify({
        data: { value: 123 },
        expiresAt: Date.now() - 1000,
        key: cacheKey,
      }),
    );

    const result = getCachedResponse('/test', 'https://api.example.com/test', storage);
    expect(result).toBeNull();
  });

  it('returns null when cache entry does not exist', () => {
    const result = getCachedResponse('/test', 'https://api.example.com/test', storage);
    expect(result).toBeNull();
  });

  it('deletes expired entries', () => {
    const cacheKey = 'api_cache:/test';
    storage.set(
      cacheKey,
      JSON.stringify({
        data: { value: 123 },
        expiresAt: Date.now() - 1000,
        key: cacheKey,
      }),
    );

    getCachedResponse('/test', 'https://api.example.com/test', storage);

    expect(storage.getString(cacheKey)).toBeUndefined();
  });

  it('handles query parameters in cache key', () => {
    const cacheKey = 'api_cache:/test?page=1';
    storage.set(
      cacheKey,
      JSON.stringify({
        data: { value: 456 },
        expiresAt: Date.now() + 10000,
        key: cacheKey,
      }),
    );

    const result = getCachedResponse('/test', 'https://api.example.com/test?page=1', storage);
    expect(result).toEqual({ value: 456 });
  });
});

describe('invalidateCache', () => {
  let storage: MMKV;

  beforeEach(() => {
    storage = new MMKV({ id: 'test-api-cache' });
    storage.clearAll();
  });

  afterEach(() => {
    storage.clearAll();
  });

  it('invalidates entries matching string pattern', () => {
    storage.set(
      'api_cache:/stations/1',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );
    storage.set(
      'api_cache:/stations/2',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );
    storage.set(
      'api_cache:/users/1',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    const deleted = invalidateCache('/stations', storage);

    expect(deleted).toBe(2);
    expect(storage.getString('api_cache:/stations/1')).toBeUndefined();
    expect(storage.getString('api_cache:/stations/2')).toBeUndefined();
    expect(storage.getString('api_cache:/users/1')).toBeDefined();
  });

  it('invalidates entries matching regex pattern', () => {
    storage.set(
      'api_cache:/stations/1',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );
    storage.set(
      'api_cache:/stations/2',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    const deleted = invalidateCache(/\/stations\/\d+/, storage);

    expect(deleted).toBe(2);
  });

  it('does not invalidate non-cache keys', () => {
    storage.set('other_key', 'value');
    storage.set(
      'api_cache:/test',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    invalidateCache('/test', storage);

    expect(storage.getString('other_key')).toBe('value');
  });
});

describe('clearCache', () => {
  let storage: MMKV;

  beforeEach(() => {
    storage = new MMKV({ id: 'test-api-cache' });
    storage.clearAll();
  });

  afterEach(() => {
    storage.clearAll();
  });

  it('clears all cache entries', () => {
    storage.set(
      'api_cache:/test1',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );
    storage.set(
      'api_cache:/test2',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    clearCache(storage);

    expect(storage.getString('api_cache:/test1')).toBeUndefined();
    expect(storage.getString('api_cache:/test2')).toBeUndefined();
  });

  it('does not clear non-cache keys', () => {
    storage.set('other_key', 'value');
    storage.set(
      'api_cache:/test',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    clearCache(storage);

    expect(storage.getString('other_key')).toBe('value');
  });
});

describe('getCacheStats', () => {
  let storage: MMKV;

  beforeEach(() => {
    storage = new MMKV({ id: 'test-api-cache' });
    storage.clearAll();
  });

  afterEach(() => {
    storage.clearAll();
  });

  it('returns correct entry count', () => {
    storage.set(
      'api_cache:/test1',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );
    storage.set(
      'api_cache:/test2',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    const stats = getCacheStats(storage);

    expect(stats.entryCount).toBe(2);
    expect(stats.expiredCount).toBe(0);
  });

  it('counts expired entries', () => {
    storage.set(
      'api_cache:/test1',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );
    storage.set(
      'api_cache:/test2',
      JSON.stringify({ data: {}, expiresAt: Date.now() - 1000, key: '' }),
    );

    const stats = getCacheStats(storage);

    expect(stats.entryCount).toBe(2);
    expect(stats.expiredCount).toBe(1);
  });

  it('ignores non-cache keys', () => {
    storage.set('other_key', 'value');
    storage.set(
      'api_cache:/test',
      JSON.stringify({ data: {}, expiresAt: Date.now() + 10000, key: '' }),
    );

    const stats = getCacheStats(storage);

    expect(stats.entryCount).toBe(1);
  });
});
