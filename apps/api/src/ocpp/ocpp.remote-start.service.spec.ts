import { OcppAction, type OcppRemoteStartTransactionResponse } from '@lilocharge/shared-types';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { RedisService } from '../redis/redis.service';
import type { OcppRpcCallOptions, OcppRpcHandler, OcppServerClient } from './ocpp.server.types';
import { OcppRegistryService } from './ocpp.registry.service';
import {
  OCPP_REMOTE_START_KEY_PREFIX,
  OcppRemoteStartService,
  type OcppRemoteStartCommand,
  type OcppTransactionTrackingLinkInput,
} from './ocpp.remote-start.service';

interface OcppClientFixture {
  readonly callMock: jest.Mock<Promise<unknown>, [string, unknown, OcppRpcCallOptions?]>;
  readonly client: OcppServerClient;
}

interface RedisServiceFixture {
  readonly delMock: jest.Mock<Promise<void>, [string]>;
  readonly entries: Map<string, { expiresAtMs: number; value: string }>;
  readonly getMock: jest.Mock<Promise<string | null>, [string]>;
  readonly scanKeysMock: jest.Mock<Promise<string[]>, [string]>;
  readonly service: RedisService;
  readonly setExMock: jest.Mock<Promise<void>, [string, number, string]>;
}

/** Builds one RemoteStartTransaction command payload for deterministic tests. */
function buildCommand(overrides?: Partial<OcppRemoteStartCommand>): OcppRemoteStartCommand {
  return {
    chargePointId: 'CP-001',
    payload: {
      connectorId: 1,
      idTag: 'user-123',
    },
    ...overrides,
  };
}

/** Builds one OCPP server client fixture with typed call and handler mocks. */
function buildClient(identity: string, protocol: string = 'ocpp1.6'): OcppClientFixture {
  const callMock = jest.fn<Promise<unknown>, [string, unknown, OcppRpcCallOptions?]>();
  const call = <TResponse>(
    method: string,
    params?: unknown,
    options?: OcppRpcCallOptions,
  ): Promise<TResponse> => {
    return callMock(method, params, options) as Promise<TResponse>;
  };

  return {
    callMock,
    client: {
      call,
      handle: jest.fn<void, [string | OcppRpcHandler, OcppRpcHandler?]>(),
      handshake: { endpoint: '/ocpp' },
      identity,
      on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
      protocol,
      session: {},
    },
  };
}

/**
 * Builds one mocked RedisService fixture backed by a shared in-memory map, so tests can share
 * tracking state between service instances (simulating an API restart) and assert Redis calls.
 */
function buildRedisService(
  entries: Map<string, { expiresAtMs: number; value: string }> = new Map(),
): RedisServiceFixture {
  const pruneExpiredEntries = (): void => {
    const nowMs = Date.now();
    entries.forEach((entry, key) => {
      if (entry.expiresAtMs <= nowMs) {
        entries.delete(key);
      }
    });
  };
  const delMock = jest.fn<Promise<void>, [string]>().mockImplementation((key: string) => {
    entries.delete(key);
    return Promise.resolve();
  });
  const getMock = jest.fn<Promise<string | null>, [string]>().mockImplementation((key: string) => {
    pruneExpiredEntries();
    return Promise.resolve(entries.get(key)?.value ?? null);
  });
  const scanKeysMock = jest
    .fn<Promise<string[]>, [string]>()
    .mockImplementation((pattern: string) => {
      pruneExpiredEntries();
      const escapedPattern = pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      const matcher = new RegExp(`^${escapedPattern}$`);
      return Promise.resolve([...entries.keys()].filter((key) => matcher.test(key)));
    });
  const setExMock = jest
    .fn<Promise<void>, [string, number, string]>()
    .mockImplementation((key: string, ttlSeconds: number, value: string) => {
      entries.set(key, { expiresAtMs: Date.now() + ttlSeconds * 1000, value });
      return Promise.resolve();
    });

  return {
    delMock,
    entries,
    getMock,
    scanKeysMock,
    service: {
      del: delMock,
      get: getMock,
      scanKeys: scanKeysMock,
      setEx: setExMock,
    } as unknown as RedisService,
    setExMock,
  };
}

/** Casts unknown RPC payloads to typed RemoteStartTransaction responses in tests. */
function asRemoteStartResponse(payload: unknown): OcppRemoteStartTransactionResponse {
  return payload as OcppRemoteStartTransactionResponse;
}

describe('OcppRemoteStartService', () => {
  let redisFixture: RedisServiceFixture;
  let registryService: OcppRegistryService;
  let service: OcppRemoteStartService;

  beforeEach(() => {
    redisFixture = buildRedisService();
    registryService = new OcppRegistryService();
    service = new OcppRemoteStartService(registryService, redisFixture.service);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends RemoteStartTransaction and stores an accepted command for later transaction-id linking', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    const command = buildCommand({
      maxAttempts: 3,
      retryDelayMs: 0,
      timeoutMs: 1500,
    });
    const result = await service.remoteStartTransaction(command);

    expect(fixture.callMock).toHaveBeenCalledTimes(1);
    expect(fixture.callMock).toHaveBeenCalledWith(
      OcppAction.REMOTE_START_TRANSACTION,
      command.payload,
      { callTimeoutMs: 1500 },
    );
    expect(result).toEqual(
      expect.objectContaining({
        attemptCount: 1,
        chargePointId: 'CP-001',
        status: 'Accepted',
      }),
    );
    expect(result.trackingId).toEqual(expect.any(String));

    const tracked = await service.getTrackedRemoteStartTransaction(result.trackingId as string);

    expect(tracked).toEqual(
      expect.objectContaining({
        chargePointId: 'CP-001',
        connectorId: 1,
        idTag: 'user-123',
        transactionId: null,
      }),
    );
  });

  it('sends RequestStartTransaction with an idToken wrapper to ocpp2.0.1 clients', async () => {
    const fixture = buildClient('CP-201', 'ocpp2.0.1');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    const command = buildCommand({ chargePointId: 'CP-201', retryDelayMs: 0, timeoutMs: 1500 });
    const result = await service.remoteStartTransaction(command);

    expect(fixture.callMock).toHaveBeenCalledTimes(1);
    expect(fixture.callMock).toHaveBeenCalledWith(
      'RequestStartTransaction',
      {
        evseId: 1,
        idToken: {
          idToken: 'user-123',
          type: 'Central',
        },
        remoteStartId: expect.any(Number) as unknown as number,
      },
      { callTimeoutMs: 1500 },
    );
    expect(result.status).toBe('Accepted');

    // Tracking still records the protocol-neutral command so correlation lookups stay uniform.
    const tracked = await service.getTrackedRemoteStartTransaction(result.trackingId as string);
    expect(tracked).toEqual(
      expect.objectContaining({
        chargePointId: 'CP-201',
        connectorId: 1,
        idTag: 'user-123',
      }),
    );
  });

  it('allocates distinct remoteStartIds for consecutive ocpp2.0.1 commands', async () => {
    const fixture = buildClient('CP-201', 'ocpp2.0.1');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    await service.remoteStartTransaction(buildCommand({ chargePointId: 'CP-201', retryDelayMs: 0 }));
    await service.remoteStartTransaction(buildCommand({ chargePointId: 'CP-201', retryDelayMs: 0 }));

    const [, firstPayload] = fixture.callMock.mock.calls[0] ?? [];
    const [, secondPayload] = fixture.callMock.mock.calls[1] ?? [];
    const firstRemoteStartId = (firstPayload as { remoteStartId: number }).remoteStartId;
    const secondRemoteStartId = (secondPayload as { remoteStartId: number }).remoteStartId;

    expect(secondRemoteStartId).toBeGreaterThan(firstRemoteStartId);
  });

  it('persists tracking records in Redis with charge-point-scoped keys and a TTL', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    const result = await service.remoteStartTransaction(
      buildCommand({
        retryDelayMs: 0,
        trackingTtlMs: 60_000,
      }),
    );

    expect(redisFixture.setExMock).toHaveBeenCalledWith(
      `${OCPP_REMOTE_START_KEY_PREFIX}:CP-001:${result.trackingId as string}`,
      60,
      expect.any(String),
    );
  });

  it('correlates a StartTransaction after a simulated API restart via shared Redis state', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    const result = await service.remoteStartTransaction(buildCommand({ retryDelayMs: 0 }));

    // Simulate a restarted API instance: new service objects, same Redis contents.
    const restartedRedis = buildRedisService(redisFixture.entries);
    const restartedService = new OcppRemoteStartService(
      new OcppRegistryService(),
      restartedRedis.service,
    );

    const linked = await restartedService.linkTransactionIdToTrackedRemoteStart({
      chargePointId: 'CP-001',
      connectorId: 1,
      idTag: 'user-123',
      transactionId: 7002,
    });

    expect(linked).toEqual(
      expect.objectContaining({
        remoteStartRequestId: result.trackingId,
        transactionId: 7002,
      }),
    );
  });

  it('retries after transient errors and succeeds on a later attempt', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock
      .mockRejectedValueOnce(new Error('Socket timeout'))
      .mockResolvedValueOnce({ status: 'Accepted' } satisfies OcppRemoteStartTransactionResponse);

    const result = await service.remoteStartTransaction(
      buildCommand({
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    );

    expect(result.attemptCount).toBe(2);
    expect(result.status).toBe('Accepted');
    expect(fixture.callMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when charge point explicitly rejects the remote-start command', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Rejected',
    } satisfies OcppRemoteStartTransactionResponse);

    const result = await service.remoteStartTransaction(
      buildCommand({
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        attemptCount: 1,
        status: 'Rejected',
        trackingId: null,
      }),
    );
    expect(fixture.callMock).toHaveBeenCalledTimes(1);
    expect(redisFixture.setExMock).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when all retry attempts fail', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockRejectedValue(new Error('Call timeout'));

    await expect(
      service.remoteStartTransaction(
        buildCommand({
          maxAttempts: 3,
          retryDelayMs: 0,
          timeoutMs: 800,
        }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fixture.callMock).toHaveBeenCalledTimes(3);
  });

  it('throws NotFoundException when no matching charge point is connected', async () => {
    await expect(service.remoteStartTransaction(buildCommand())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('links received transaction ids to the most recent compatible tracked remote-start command', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    const first = await service.remoteStartTransaction(buildCommand({ retryDelayMs: 0 }));
    const second = await service.remoteStartTransaction(buildCommand({ retryDelayMs: 0 }));

    const linked = await service.linkTransactionIdToTrackedRemoteStart({
      chargePointId: 'CP-001',
      connectorId: 1,
      idTag: 'user-123',
      transactionId: 7001,
    });

    expect(linked).toEqual(
      expect.objectContaining({
        remoteStartRequestId: second.trackingId,
        transactionId: 7001,
      }),
    );

    const firstTracked = await service.getTrackedRemoteStartTransaction(
      first.trackingId as string,
    );
    const secondTracked = await service.getTrackedRemoteStartTransaction(
      second.trackingId as string,
    );
    const byTransactionId = await service.findTrackedRemoteStartTransactionByTransactionId(
      'CP-001',
      7001,
    );

    expect(firstTracked?.transactionId).toBeNull();
    expect(secondTracked?.transactionId).toBe(7001);
    expect(byTransactionId?.remoteStartRequestId).toBe(second.trackingId);
  });

  it('does not link transaction ids to expired tracking records', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-17T10:00:00.000Z'));

    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    const result = await service.remoteStartTransaction(
      buildCommand({
        retryDelayMs: 0,
        trackingTtlMs: 1000,
      }),
    );
    jest.setSystemTime(new Date('2026-02-17T10:00:02.000Z'));

    const linkInput: OcppTransactionTrackingLinkInput = {
      chargePointId: 'CP-001',
      connectorId: 1,
      idTag: 'user-123',
      transactionId: 7100,
    };

    await expect(service.linkTransactionIdToTrackedRemoteStart(linkInput)).resolves.toBeNull();
    await expect(
      service.getTrackedRemoteStartTransaction(result.trackingId as string),
    ).resolves.toBeNull();
  });

  it('still reports acceptance when tracking persistence fails (best-effort correlation)', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);
    redisFixture.setExMock.mockRejectedValue(new Error('Redis unavailable'));

    const result = await service.remoteStartTransaction(buildCommand({ retryDelayMs: 0 }));

    expect(result.status).toBe('Accepted');
    expect(result.trackingId).toEqual(expect.any(String));
  });

  it('retries on malformed response payloads until a valid response is received', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock
      .mockResolvedValueOnce({ status: 'ACCEPTED' })
      .mockResolvedValueOnce({ status: 'Accepted' } satisfies OcppRemoteStartTransactionResponse);

    const result = await service.remoteStartTransaction(
      buildCommand({
        maxAttempts: 2,
        retryDelayMs: 0,
      }),
    );

    expect(asRemoteStartResponse({ status: result.status }).status).toBe('Accepted');
    expect(result.attemptCount).toBe(2);
  });

  it('falls back to in-memory tracking when no Redis service is provided', async () => {
    const fixture = buildClient('CP-001');
    const localRegistry = new OcppRegistryService();
    localRegistry.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);
    const inMemoryService = new OcppRemoteStartService(localRegistry);

    const result = await inMemoryService.remoteStartTransaction(buildCommand({ retryDelayMs: 0 }));
    const tracked = await inMemoryService.getTrackedRemoteStartTransaction(
      result.trackingId as string,
    );

    expect(tracked?.chargePointId).toBe('CP-001');
  });
});
