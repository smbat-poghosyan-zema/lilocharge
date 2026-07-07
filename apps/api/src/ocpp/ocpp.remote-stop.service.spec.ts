import { OcppAction, type OcppRemoteStopTransactionResponse } from '@lilocharge/shared-types';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { OcppRpcCallOptions, OcppRpcHandler, OcppServerClient } from './ocpp.server.types';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRemoteStopService, type OcppRemoteStopCommand } from './ocpp.remote-stop.service';

interface OcppClientFixture {
  readonly callMock: jest.Mock<Promise<unknown>, [string, unknown, OcppRpcCallOptions?]>;
  readonly client: OcppServerClient;
}

/** Builds one RemoteStopTransaction command payload fixture for deterministic tests. */
function buildCommand(overrides?: Partial<OcppRemoteStopCommand>): OcppRemoteStopCommand {
  return {
    chargePointId: 'CP-001',
    payload: {
      transactionId: 7001,
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

/** Casts unknown RPC payloads to typed RemoteStopTransaction responses in tests. */
function asRemoteStopResponse(payload: unknown): OcppRemoteStopTransactionResponse {
  return payload as OcppRemoteStopTransactionResponse;
}

describe('OcppRemoteStopService', () => {
  let registryService: OcppRegistryService;
  let service: OcppRemoteStopService;

  beforeEach(() => {
    registryService = new OcppRegistryService();
    service = new OcppRemoteStopService(registryService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends RemoteStopTransaction and returns an accepted response', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStopTransactionResponse);

    const command = buildCommand({
      maxAttempts: 3,
      retryDelayMs: 0,
      timeoutMs: 1500,
    });
    const result = await service.remoteStopTransaction(command);

    expect(fixture.callMock).toHaveBeenCalledTimes(1);
    expect(fixture.callMock).toHaveBeenCalledWith(
      OcppAction.REMOTE_STOP_TRANSACTION,
      command.payload,
      { callTimeoutMs: 1500 },
    );
    expect(result).toEqual({
      attemptCount: 1,
      chargePointId: 'CP-001',
      status: 'Accepted',
    });
  });

  it('sends RequestStopTransaction with a string transaction id to ocpp2.0.1 clients', async () => {
    const fixture = buildClient('CP-201', 'ocpp2.0.1');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStopTransactionResponse);

    const result = await service.remoteStopTransaction(
      buildCommand({ chargePointId: 'CP-201', retryDelayMs: 0, timeoutMs: 1500 }),
    );

    expect(fixture.callMock).toHaveBeenCalledTimes(1);
    expect(fixture.callMock).toHaveBeenCalledWith(
      'RequestStopTransaction',
      { transactionId: '7001' },
      { callTimeoutMs: 1500 },
    );
    expect(result).toEqual({
      attemptCount: 1,
      chargePointId: 'CP-201',
      status: 'Accepted',
    });
  });

  it('retries after transient errors and succeeds on a later attempt', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock
      .mockRejectedValueOnce(new Error('Socket timeout'))
      .mockResolvedValueOnce({ status: 'Accepted' } satisfies OcppRemoteStopTransactionResponse);

    const result = await service.remoteStopTransaction(
      buildCommand({
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    );

    expect(result.attemptCount).toBe(2);
    expect(result.status).toBe('Accepted');
    expect(fixture.callMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when charge point explicitly rejects the remote-stop command', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockResolvedValue({
      status: 'Rejected',
    } satisfies OcppRemoteStopTransactionResponse);

    const result = await service.remoteStopTransaction(
      buildCommand({
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    );

    expect(result).toEqual({
      attemptCount: 1,
      chargePointId: 'CP-001',
      status: 'Rejected',
    });
    expect(fixture.callMock).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceUnavailableException when all retry attempts fail', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock.mockRejectedValue(new Error('Call timeout'));

    await expect(
      service.remoteStopTransaction(
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
    await expect(service.remoteStopTransaction(buildCommand())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('retries on malformed response payloads until a valid response is received', async () => {
    const fixture = buildClient('CP-001');
    registryService.registerChargePoint(fixture.client);
    fixture.callMock
      .mockResolvedValueOnce({ status: 'ACCEPTED' })
      .mockResolvedValueOnce({ status: 'Accepted' } satisfies OcppRemoteStopTransactionResponse);

    const result = await service.remoteStopTransaction(
      buildCommand({
        maxAttempts: 2,
        retryDelayMs: 0,
      }),
    );

    expect(asRemoteStopResponse({ status: result.status }).status).toBe('Accepted');
    expect(result.attemptCount).toBe(2);
  });
});
