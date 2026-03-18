import { OcppAction, type OcppRemoteStartTransactionResponse } from '@lilocharge/shared-types';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { OcppRpcCallOptions, OcppRpcHandler, OcppServerClient } from './ocpp.server.types';
import { OcppRegistryService } from './ocpp.registry.service';
import {
  OcppRemoteStartService,
  type OcppRemoteStartCommand,
  type OcppTransactionTrackingLinkInput,
} from './ocpp.remote-start.service';

interface OcppClientFixture {
  readonly callMock: jest.Mock<Promise<unknown>, [string, unknown, OcppRpcCallOptions?]>;
  readonly client: OcppServerClient;
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
function buildClient(identity: string): OcppClientFixture {
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
      protocol: 'ocpp1.6',
      session: {},
    },
  };
}

/** Casts unknown RPC payloads to typed RemoteStartTransaction responses in tests. */
function asRemoteStartResponse(payload: unknown): OcppRemoteStartTransactionResponse {
  return payload as OcppRemoteStartTransactionResponse;
}

describe('OcppRemoteStartService', () => {
  let registryService: OcppRegistryService;
  let service: OcppRemoteStartService;

  beforeEach(() => {
    registryService = new OcppRegistryService();
    service = new OcppRemoteStartService(registryService);
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

    const tracked = service.getTrackedRemoteStartTransaction(result.trackingId as string);

    expect(tracked).toEqual(
      expect.objectContaining({
        chargePointId: 'CP-001',
        connectorId: 1,
        idTag: 'user-123',
        transactionId: null,
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

    const linked = service.linkTransactionIdToTrackedRemoteStart({
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

    const firstTracked = service.getTrackedRemoteStartTransaction(first.trackingId as string);
    const secondTracked = service.getTrackedRemoteStartTransaction(second.trackingId as string);
    const byTransactionId = service.findTrackedRemoteStartTransactionByTransactionId(
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

    expect(service.linkTransactionIdToTrackedRemoteStart(linkInput)).toBeNull();
    expect(service.getTrackedRemoteStartTransaction(result.trackingId as string)).toBeNull();
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
});
