import type { OcppServerAuthCallback, OcppServerClient } from './ocpp.server.types';
import type { OcppChargePointRegistration } from './ocpp.registry.service';
import type { OcppRoutingService } from './ocpp.routing.service';
import type { OcppServerFactory, OcppServerFactoryOptions } from './ocpp.server.factory';
import type { OcppServer } from './ocpp.server.types';
import type { OcppRegistryService } from './ocpp.registry.service';
import {
  isOcppServerEnabled,
  OcppServerService,
  resolveOcppHost,
  resolveOcppPort,
} from './ocpp.server.service';

interface OcppServerMock extends OcppServer {
  readonly auth: jest.Mock<void, [OcppServerAuthCallback]>;
  readonly close: jest.Mock<Promise<void>, [{ readonly code?: number; readonly reason?: string }?]>;
  readonly listen: jest.Mock<Promise<unknown>, [number, string]>;
  readonly on: jest.Mock<void, [string, (...args: unknown[]) => void]>;
}

interface OcppServerFactoryMock extends Pick<OcppServerFactory, 'createServer'> {
  readonly createServer: jest.Mock<OcppServer, [OcppServerFactoryOptions]>;
}

interface OcppRoutingServiceMock extends Pick<OcppRoutingService, 'attachClientHandlers'> {
  readonly attachClientHandlers: jest.Mock<void, [OcppServerClient]>;
}

interface OcppRegistryServiceMock extends Pick<
  OcppRegistryService,
  'registerChargePoint' | 'unregisterChargePoint'
> {
  readonly registerChargePoint: jest.Mock<OcppChargePointRegistration, [OcppServerClient, Date?]>;
  readonly unregisterChargePoint: jest.Mock<boolean, [string]>;
}

/** Builds a deterministic OCPP registration fixture for server lifecycle tests. */
function buildRegistration(client: OcppServerClient): OcppChargePointRegistration {
  return {
    client,
    connectedAt: '2026-02-17T08:00:00.000Z',
    endpoint: '/ocpp',
    heartbeatIntervalSeconds: null,
    identity: 'CP-001',
    lastBootNotification: null,
    lastBootNotificationAt: null,
    lastHeartbeatAt: null,
    lastSeenAt: '2026-02-17T08:00:00.000Z',
    protocol: 'ocpp1.6',
    registrationStatus: 'Pending',
    session: {},
  };
}

describe('OcppServerService', () => {
  const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };

  let clientEventListeners: Map<string, (...args: unknown[]) => void>;
  let serverEventListeners: Map<string, (...args: unknown[]) => void>;
  let factoryMock: OcppServerFactoryMock;
  let registryMock: OcppRegistryServiceMock;
  let routingMock: OcppRoutingServiceMock;
  let serverMock: OcppServerMock;
  let service: OcppServerService;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    clientEventListeners = new Map<string, (...args: unknown[]) => void>();
    serverEventListeners = new Map<string, (...args: unknown[]) => void>();

    serverMock = {
      auth: jest.fn<void, [OcppServerAuthCallback]>(),
      close: jest
        .fn<Promise<void>, [{ readonly code?: number; readonly reason?: string }?]>()
        .mockResolvedValue(),
      listen: jest.fn<Promise<unknown>, [number, string]>().mockResolvedValue({}),
      on: jest
        .fn<void, [string, (...args: unknown[]) => void]>()
        .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          serverEventListeners.set(event, handler);
        }),
    };
    factoryMock = {
      createServer: jest.fn<OcppServer, [OcppServerFactoryOptions]>().mockReturnValue(serverMock),
    };
    routingMock = {
      attachClientHandlers: jest.fn<void, [OcppServerClient]>(),
    };
    registryMock = {
      registerChargePoint: jest
        .fn<OcppChargePointRegistration, [OcppServerClient, Date?]>()
        .mockImplementation((client: OcppServerClient) => buildRegistration(client)),
      unregisterChargePoint: jest.fn<boolean, [string]>().mockReturnValue(true),
    };
    service = new OcppServerService(
      routingMock as unknown as OcppRoutingService,
      registryMock as unknown as OcppRegistryService,
      factoryMock as unknown as OcppServerFactory,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('creates and listens with default host, port, protocol, and strict mode options', async () => {
    await service.onModuleInit();

    expect(factoryMock.createServer).toHaveBeenCalledWith({
      protocols: ['ocpp1.6'],
      strictMode: true,
    });
    expect(serverMock.listen).toHaveBeenCalledWith(9220, '0.0.0.0');
    expect(serverMock.auth).toHaveBeenCalledTimes(1);
  });

  it('authenticates non-empty identities and rejects blank identities', async () => {
    await service.onModuleInit();
    const [authCallback] = serverMock.auth.mock.calls[0] ?? [];
    const accept = jest.fn<
      void,
      [Record<string, unknown> | undefined, string | false | undefined]
    >();
    const reject = jest.fn<void, [number, string]>();

    authCallback?.(accept, reject, { endpoint: '/ocpp', identity: 'CP-001' });
    authCallback?.(accept, reject, { endpoint: '/ocpp', identity: ' ' });

    const [acceptedSession, acceptedProtocol] = accept.mock.calls[0] ?? [undefined, undefined];

    expect(acceptedProtocol).toBe('ocpp1.6');
    expect(typeof acceptedSession?.connectedAt).toBe('string');
    expect(reject).toHaveBeenCalledWith(401, 'Charge point identity is required');
  });

  it('registers charge points and detaches them on disconnect', async () => {
    await service.onModuleInit();

    const client: OcppServerClient = {
      handle: jest.fn<
        void,
        [string | ((...args: unknown[]) => unknown), ((...args: unknown[]) => unknown)?]
      >(),
      handshake: { endpoint: '/ocpp' },
      identity: 'CP-001',
      on: jest
        .fn<void, [string, (...args: unknown[]) => void]>()
        .mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
          clientEventListeners.set(event, listener);
        }),
      protocol: 'ocpp1.6',
      session: {},
    };

    serverEventListeners.get('client')?.(client);
    clientEventListeners.get('disconnect')?.({ code: 1000, reason: 'normal closure' });

    expect(registryMock.registerChargePoint).toHaveBeenCalledWith(client);
    expect(routingMock.attachClientHandlers).toHaveBeenCalledWith(client);
    expect(registryMock.unregisterChargePoint).toHaveBeenCalledWith('CP-001');
  });

  it('closes the OCPP server on module shutdown after startup', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(serverMock.close).toHaveBeenCalledWith({
      awaitPending: false,
      code: 1001,
      reason: 'LiloCharge OCPP server shutdown',
    });
  });

  it('skips startup when OCPP is explicitly disabled via environment flag', async () => {
    process.env.OCPP_WS_ENABLED = 'false';

    await service.onModuleInit();

    expect(factoryMock.createServer).not.toHaveBeenCalled();
    expect(serverMock.listen).not.toHaveBeenCalled();
  });
});

describe('ocpp server helpers', () => {
  it('resolves valid ports and falls back for invalid values', () => {
    expect(resolveOcppPort(undefined)).toBe(9220);
    expect(resolveOcppPort('9300')).toBe(9300);
    expect(resolveOcppPort('0')).toBe(9220);
    expect(resolveOcppPort('70000')).toBe(9220);
    expect(resolveOcppPort('not-a-number')).toBe(9220);
  });

  it('resolves hostnames and falls back for blank values', () => {
    expect(resolveOcppHost(undefined)).toBe('0.0.0.0');
    expect(resolveOcppHost('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveOcppHost('   ')).toBe('0.0.0.0');
  });

  it('parses server-enabled flags with disabled sentinel values', () => {
    expect(isOcppServerEnabled(undefined)).toBe(true);
    expect(isOcppServerEnabled('TRUE')).toBe(true);
    expect(isOcppServerEnabled('false')).toBe(false);
    expect(isOcppServerEnabled('0')).toBe(false);
    expect(isOcppServerEnabled('off')).toBe(false);
  });
});
