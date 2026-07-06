import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server as HttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PrismaService } from '../prisma/prisma.service';
import type { OcppServerAuthCallback, OcppServerClient } from './ocpp.server.types';
import type { OcppChargePointRegistration } from './ocpp.registry.service';
import type { OcppRoutingService } from './ocpp.routing.service';
import type {
  OcppServerFactory,
  OcppServerFactoryOptions,
  OcppTlsServerOptions,
} from './ocpp.server.factory';
import type { OcppServer } from './ocpp.server.types';
import type { OcppRegistryService } from './ocpp.registry.service';
import {
  isOcppServerEnabled,
  OcppServerService,
  resolveOcppHost,
  resolveOcppPort,
  resolveOcppTlsPaths,
} from './ocpp.server.service';

interface OcppServerMock extends OcppServer {
  readonly auth: jest.Mock<void, [OcppServerAuthCallback]>;
  readonly close: jest.Mock<Promise<void>, [{ readonly code?: number; readonly reason?: string }?]>;
  readonly handleUpgrade: jest.Mock<Promise<void>, [unknown, unknown, unknown]>;
  readonly listen: jest.Mock<Promise<unknown>, [number, string]>;
  readonly on: jest.Mock<void, [string, (...args: unknown[]) => void]>;
}

interface TlsServerMock {
  readonly close: jest.Mock<void, [(() => void)?]>;
  readonly closeAllConnections: jest.Mock<void, []>;
  readonly listen: jest.Mock<void, [number, string, () => void]>;
  readonly on: jest.Mock<void, [string, (...args: unknown[]) => void]>;
  readonly once: jest.Mock<void, [string, (...args: unknown[]) => void]>;
  readonly removeListener: jest.Mock<void, [string, (...args: unknown[]) => void]>;
}

interface OcppServerFactoryMock extends Pick<OcppServerFactory, 'createServer' | 'createTlsServer'> {
  readonly createServer: jest.Mock<OcppServer, [OcppServerFactoryOptions]>;
  readonly createTlsServer: jest.Mock<HttpsServer, [OcppTlsServerOptions]>;
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

interface PrismaServiceMock {
  readonly session: {
    readonly findMany: jest.Mock<Promise<{ readonly id: string }[]>, [unknown]>;
  };
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

/** Builds one mocked HTTPS server whose listen callback resolves immediately. */
function buildTlsServerMock(): TlsServerMock {
  return {
    close: jest.fn<void, [(() => void)?]>().mockImplementation((callback) => {
      callback?.();
    }),
    closeAllConnections: jest.fn<void, []>(),
    listen: jest
      .fn<void, [number, string, () => void]>()
      .mockImplementation((_port, _host, callback) => {
        callback();
      }),
    on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
    once: jest.fn<void, [string, (...args: unknown[]) => void]>(),
    removeListener: jest.fn<void, [string, (...args: unknown[]) => void]>(),
  };
}

describe('OcppServerService', () => {
  const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };

  let clientEventListeners: Map<string, (...args: unknown[]) => void>;
  let serverEventListeners: Map<string, (...args: unknown[]) => void>;
  let factoryMock: OcppServerFactoryMock;
  let prismaMock: PrismaServiceMock;
  let registryMock: OcppRegistryServiceMock;
  let routingMock: OcppRoutingServiceMock;
  let serverMock: OcppServerMock;
  let service: OcppServerService;
  let tlsServerMock: TlsServerMock;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.OCPP_AUTH_MODE;
    delete process.env.OCPP_ALLOWED_IDENTITIES;
    delete process.env.OCPP_IDENTITY_SECRETS;
    delete process.env.OCPP_WS_TLS_CERT_PATH;
    delete process.env.OCPP_WS_TLS_KEY_PATH;
    clientEventListeners = new Map<string, (...args: unknown[]) => void>();
    serverEventListeners = new Map<string, (...args: unknown[]) => void>();

    serverMock = {
      auth: jest.fn<void, [OcppServerAuthCallback]>(),
      close: jest
        .fn<Promise<void>, [{ readonly code?: number; readonly reason?: string }?]>()
        .mockResolvedValue(),
      handleUpgrade: jest.fn<Promise<void>, [unknown, unknown, unknown]>().mockResolvedValue(),
      listen: jest.fn<Promise<unknown>, [number, string]>().mockResolvedValue({}),
      on: jest
        .fn<void, [string, (...args: unknown[]) => void]>()
        .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
          serverEventListeners.set(event, handler);
        }),
    };
    tlsServerMock = buildTlsServerMock();
    factoryMock = {
      createServer: jest.fn<OcppServer, [OcppServerFactoryOptions]>().mockReturnValue(serverMock),
      createTlsServer: jest
        .fn<HttpsServer, [OcppTlsServerOptions]>()
        .mockReturnValue(tlsServerMock as unknown as HttpsServer),
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
    prismaMock = {
      session: {
        findMany: jest.fn<Promise<{ readonly id: string }[]>, [unknown]>().mockResolvedValue([]),
      },
    };
    service = new OcppServerService(
      routingMock as unknown as OcppRoutingService,
      registryMock as unknown as OcppRegistryService,
      factoryMock as unknown as OcppServerFactory,
      prismaMock as unknown as PrismaService,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  /** Starts the service and returns the registered auth callback for handshake tests. */
  async function initAndGetAuthCallback(): Promise<OcppServerAuthCallback> {
    await service.onModuleInit();
    const [authCallback] = serverMock.auth.mock.calls[0] ?? [];

    if (authCallback === undefined) {
      throw new Error('auth callback was not registered');
    }

    return authCallback;
  }

  it('creates and listens with default host, port, protocol, and strict mode options', async () => {
    await service.onModuleInit();

    expect(factoryMock.createServer).toHaveBeenCalledWith({
      protocols: ['ocpp1.6'],
      strictMode: true,
    });
    expect(serverMock.listen).toHaveBeenCalledWith(9220, '0.0.0.0');
    expect(serverMock.auth).toHaveBeenCalledTimes(1);
    expect(factoryMock.createTlsServer).not.toHaveBeenCalled();
  });

  it('authenticates non-empty identities and rejects blank identities in open mode', async () => {
    const authCallback = await initAndGetAuthCallback();
    const accept = jest.fn<
      void,
      [Record<string, unknown> | undefined, string | false | undefined]
    >();
    const reject = jest.fn<void, [number, string]>();

    authCallback(accept, reject, { endpoint: '/ocpp', identity: 'CP-001' });
    authCallback(accept, reject, { endpoint: '/ocpp', identity: ' ' });

    const [acceptedSession, acceptedProtocol] = accept.mock.calls[0] ?? [undefined, undefined];

    expect(acceptedProtocol).toBe('ocpp1.6');
    expect(typeof acceptedSession?.connectedAt).toBe('string');
    expect(reject).toHaveBeenCalledWith(401, 'Charge point identity is required');
  });

  it('accepts only allowlisted identities in allowlist mode', async () => {
    process.env.OCPP_AUTH_MODE = 'allowlist';
    process.env.OCPP_ALLOWED_IDENTITIES = 'CP-001, CP-002';

    const authCallback = await initAndGetAuthCallback();
    const accept = jest.fn<
      void,
      [Record<string, unknown> | undefined, string | false | undefined]
    >();
    const reject = jest.fn<void, [number, string]>();

    authCallback(accept, reject, { endpoint: '/ocpp', identity: 'CP-002' });
    authCallback(accept, reject, { endpoint: '/ocpp', identity: 'CP-999' });

    expect(accept).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith(401, 'Unauthorized charge point');
  });

  it('validates HTTP Basic passwords against configured identity secrets in basic mode', async () => {
    process.env.OCPP_AUTH_MODE = 'basic';
    process.env.OCPP_IDENTITY_SECRETS = '{"CP-001":"s3cret"}';

    const authCallback = await initAndGetAuthCallback();
    const accept = jest.fn<
      void,
      [Record<string, unknown> | undefined, string | false | undefined]
    >();
    const reject = jest.fn<void, [number, string]>();

    authCallback(accept, reject, {
      endpoint: '/ocpp',
      identity: 'CP-001',
      password: Buffer.from('s3cret'),
    });
    authCallback(accept, reject, {
      endpoint: '/ocpp',
      identity: 'CP-001',
      password: Buffer.from('wrong-secret'),
    });
    authCallback(accept, reject, { endpoint: '/ocpp', identity: 'CP-001' });
    authCallback(accept, reject, {
      endpoint: '/ocpp',
      identity: 'CP-404',
      password: Buffer.from('s3cret'),
    });

    expect(accept).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledTimes(3);
    expect(reject).toHaveBeenCalledWith(401, 'Unauthorized charge point');
  });

  it('fails startup fast when the auth mode is misconfigured', async () => {
    process.env.OCPP_AUTH_MODE = 'basic';

    await expect(service.onModuleInit()).rejects.toThrow(/OCPP_IDENTITY_SECRETS/);
    expect(factoryMock.createServer).not.toHaveBeenCalled();
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

  it('looks up ACTIVE sessions for the charge point after a disconnect', async () => {
    prismaMock.session.findMany.mockResolvedValue([{ id: 'session-1' }, { id: 'session-2' }]);
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
    clientEventListeners.get('disconnect')?.({ code: 1006, reason: 'connection lost' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prismaMock.session.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        connector: {
          station: {
            operatorId: 'CP-001',
          },
        },
      },
      select: { id: true },
    });
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

  describe('TLS (wss://) listener', () => {
    let temporaryDirectory: string;
    let certPath: string;
    let keyPath: string;

    beforeEach(() => {
      temporaryDirectory = mkdtempSync(join(tmpdir(), 'ocpp-tls-'));
      certPath = join(temporaryDirectory, 'tls.crt');
      keyPath = join(temporaryDirectory, 'tls.key');
      writeFileSync(certPath, 'FAKE-CERT-PEM');
      writeFileSync(keyPath, 'FAKE-KEY-PEM');
    });

    afterEach(() => {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    });

    it('terminates TLS through an HTTPS server wired to the ocpp-rpc upgrade handler', async () => {
      process.env.OCPP_WS_TLS_CERT_PATH = certPath;
      process.env.OCPP_WS_TLS_KEY_PATH = keyPath;

      await service.onModuleInit();

      expect(factoryMock.createTlsServer).toHaveBeenCalledWith({
        cert: Buffer.from('FAKE-CERT-PEM'),
        key: Buffer.from('FAKE-KEY-PEM'),
      });
      expect(tlsServerMock.on).toHaveBeenCalledWith('upgrade', expect.any(Function));
      expect(tlsServerMock.listen).toHaveBeenCalledWith(9220, '0.0.0.0', expect.any(Function));
      expect(serverMock.listen).not.toHaveBeenCalled();

      const upgradeCall = tlsServerMock.on.mock.calls.find(([event]) => event === 'upgrade');
      const upgradeListener = upgradeCall?.[1];
      upgradeListener?.({}, {}, Buffer.alloc(0));

      expect(serverMock.handleUpgrade).toHaveBeenCalledTimes(1);
    });

    it('closes the TLS server together with the RPC server on shutdown', async () => {
      process.env.OCPP_WS_TLS_CERT_PATH = certPath;
      process.env.OCPP_WS_TLS_KEY_PATH = keyPath;

      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(serverMock.close).toHaveBeenCalledTimes(1);
      expect(tlsServerMock.close).toHaveBeenCalledTimes(1);
      expect(tlsServerMock.closeAllConnections).toHaveBeenCalledTimes(1);
    });

    it('fails startup fast when only one TLS path is configured', async () => {
      process.env.OCPP_WS_TLS_CERT_PATH = certPath;

      await expect(service.onModuleInit()).rejects.toThrow(/OCPP_WS_TLS_KEY_PATH/);
      expect(factoryMock.createServer).not.toHaveBeenCalled();
    });
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

  it('resolves TLS paths only when both cert and key paths are provided', () => {
    expect(resolveOcppTlsPaths(undefined, undefined)).toBeNull();
    expect(resolveOcppTlsPaths('  ', '')).toBeNull();
    expect(resolveOcppTlsPaths('/certs/tls.crt', '/certs/tls.key')).toEqual({
      certPath: '/certs/tls.crt',
      keyPath: '/certs/tls.key',
    });
    expect(() => resolveOcppTlsPaths('/certs/tls.crt', undefined)).toThrow(
      /OCPP_WS_TLS_KEY_PATH/,
    );
    expect(() => resolveOcppTlsPaths(undefined, '/certs/tls.key')).toThrow(
      /OCPP_WS_TLS_CERT_PATH/,
    );
  });
});
