import { OCPP_ID_TAG_LENGTH, OcppIdTagService } from './ocpp.id-tag.service';
import type { RedisService } from '../redis/redis.service';

interface StoreMock {
  readonly get: jest.Mock<Promise<string | null>, [string]>;
  readonly setEx: jest.Mock<Promise<void>, [string, number, string]>;
}

const TEST_USER_ID = '33333333-3333-3333-3333-333333333333';

function buildStoreMock(): StoreMock {
  return {
    get: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
    setEx: jest.fn<Promise<void>, [string, number, string]>().mockResolvedValue(undefined),
  };
}

describe('OcppIdTagService', () => {
  let storeMock: StoreMock;
  let service: OcppIdTagService;

  beforeEach(() => {
    storeMock = buildStoreMock();
    service = new OcppIdTagService(storeMock as unknown as RedisService);
  });

  it('issues protocol-conformant 20-character idTags bound to the user', async () => {
    const idTag = await service.issueIdTag(TEST_USER_ID);

    expect(idTag).toHaveLength(OCPP_ID_TAG_LENGTH);
    expect(idTag).toMatch(/^[0-9a-f]{20}$/);
    expect(storeMock.setEx).toHaveBeenCalledWith(`ocpp:idtag:${idTag}`, 86400, TEST_USER_ID);
  });

  it('issues unique idTags per call', async () => {
    const first = await service.issueIdTag(TEST_USER_ID);
    const second = await service.issueIdTag(TEST_USER_ID);

    expect(first).not.toBe(second);
  });

  it('resolves one issued idTag back to the stored user id', async () => {
    storeMock.get.mockResolvedValue(TEST_USER_ID);

    await expect(service.resolveUserId('abcdefabcdefabcdefab')).resolves.toBe(TEST_USER_ID);
    expect(storeMock.get).toHaveBeenCalledWith('ocpp:idtag:abcdefabcdefabcdefab');
  });

  it('accepts full user UUIDs for direct service-level callers', async () => {
    await expect(service.resolveUserId(TEST_USER_ID.toUpperCase())).resolves.toBe(TEST_USER_ID);
    expect(storeMock.get).not.toHaveBeenCalled();
  });

  it('rejects unknown, empty, and over-length tags', async () => {
    await expect(service.resolveUserId('unknown-tag')).resolves.toBeNull();
    await expect(service.resolveUserId('   ')).resolves.toBeNull();
    await expect(service.resolveUserId('x'.repeat(21))).resolves.toBeNull();
  });

  it('falls back to in-memory storage with expiry when Redis is unavailable', async () => {
    const inMemoryService = new OcppIdTagService();

    const idTag = await inMemoryService.issueIdTag(TEST_USER_ID, 60);
    await expect(inMemoryService.resolveUserId(idTag)).resolves.toBe(TEST_USER_ID);

    const expiredTag = await inMemoryService.issueIdTag(TEST_USER_ID, 0);
    await expect(inMemoryService.resolveUserId(expiredTag)).resolves.toBeNull();
  });
});
