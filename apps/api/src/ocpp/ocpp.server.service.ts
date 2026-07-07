import { readFileSync } from 'node:fs';
import type { Server as HttpsServer } from 'node:https';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { evaluateChargePointAuth, resolveOcppAuthConfig } from './ocpp.auth';
import {
  DEFAULT_OCPP_HOST,
  DEFAULT_OCPP_PORT,
  DISABLED_FLAG_VALUES,
  OCPP_PROTOCOL_2_0_1,
  OCPP_PROTOCOLS,
} from './ocpp.constants';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRoutingService } from './ocpp.routing.service';
import { Ocpp2RoutingService } from './ocpp2.routing.service';
import { OcppServerFactory } from './ocpp.server.factory';
import type { OcppServer, OcppServerClient } from './ocpp.server.types';

const MAX_PORT = 65535;
const OCPP_CLOSE_CODE_GOING_AWAY = 1001;
const OCPP_SHUTDOWN_REASON = 'LiloCharge OCPP server shutdown';
const OCPP_AUTH_REJECT_CODE = 401;

/** Filesystem paths to PEM-encoded TLS material for the OCPP `wss://` listener. */
export interface OcppTlsPaths {
  readonly certPath: string;
  readonly keyPath: string;
}

/** Resolves OCPP host binding values with fallback to default host. */
export function resolveOcppHost(rawHost: string | undefined): string {
  const normalizedHost = rawHost?.trim();

  if (normalizedHost === undefined || normalizedHost.length === 0) {
    return DEFAULT_OCPP_HOST;
  }

  return normalizedHost;
}

/** Resolves OCPP port values with fallback to default port on invalid input. */
export function resolveOcppPort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_OCPP_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > MAX_PORT) {
    return DEFAULT_OCPP_PORT;
  }

  return port;
}

/** Resolves whether the OCPP server should start, based on an environment flag. */
export function isOcppServerEnabled(rawFlag: string | undefined): boolean {
  if (rawFlag === undefined) {
    return true;
  }

  const normalizedFlag = rawFlag.trim().toLowerCase();
  return !DISABLED_FLAG_VALUES.includes(normalizedFlag as (typeof DISABLED_FLAG_VALUES)[number]);
}

/**
 * Resolves OCPP TLS certificate/key paths from environment values.
 *
 * Returns null when TLS is not configured (plain `ws://` listener) and throws when only one of
 * the two paths is provided, so partial TLS misconfiguration fails fast at startup.
 */
export function resolveOcppTlsPaths(
  rawCertPath: string | undefined,
  rawKeyPath: string | undefined,
): OcppTlsPaths | null {
  const certPath = rawCertPath?.trim();
  const keyPath = rawKeyPath?.trim();
  const hasCertPath = certPath !== undefined && certPath.length > 0;
  const hasKeyPath = keyPath !== undefined && keyPath.length > 0;

  if (!hasCertPath && !hasKeyPath) {
    return null;
  }

  if (!hasCertPath || !hasKeyPath) {
    throw new Error(
      'OCPP TLS requires both OCPP_WS_TLS_CERT_PATH and OCPP_WS_TLS_KEY_PATH to be set',
    );
  }

  return { certPath, keyPath };
}

/** Lifecycle-managed central-system WebSocket server for OCPP 1.6-J and 2.0.1 charge points. */
@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(OcppServerService.name);
  private rpcServer: OcppServer | null = null;
  private tlsServer: HttpsServer | null = null;

  constructor(
    private readonly routingService: OcppRoutingService,
    private readonly ocpp2RoutingService: Ocpp2RoutingService,
    private readonly registryService: OcppRegistryService,
    private readonly serverFactory: OcppServerFactory,
    private readonly prismaService: PrismaService,
  ) {}

  /** Starts the OCPP WebSocket server and binds connection, auth, and routing handlers. */
  public async onModuleInit(): Promise<void> {
    if (!isOcppServerEnabled(process.env.OCPP_WS_ENABLED)) {
      this.logger.log('OCPP server startup skipped because OCPP_WS_ENABLED is disabled');
      return;
    }

    const authConfig = resolveOcppAuthConfig({
      OCPP_ALLOWED_IDENTITIES: process.env.OCPP_ALLOWED_IDENTITIES,
      OCPP_AUTH_MODE: process.env.OCPP_AUTH_MODE,
      OCPP_IDENTITY_SECRETS: process.env.OCPP_IDENTITY_SECRETS,
    });
    if (authConfig.mode === 'open') {
      this.logger.warn(
        'OCPP_AUTH_MODE is "open": any charge point identity is accepted without credentials. ' +
          'Set OCPP_AUTH_MODE=allowlist or OCPP_AUTH_MODE=basic before exposing this server in production.',
      );
    }

    const tlsPaths = resolveOcppTlsPaths(
      process.env.OCPP_WS_TLS_CERT_PATH,
      process.env.OCPP_WS_TLS_KEY_PATH,
    );

    this.rpcServer = this.serverFactory.createServer({
      protocols: [...OCPP_PROTOCOLS],
      strictMode: true,
    });
    this.rpcServer.auth((accept, reject, handshake) => {
      const identity = handshake.identity.trim();

      if (identity.length === 0) {
        reject(OCPP_AUTH_REJECT_CODE, 'Charge point identity is required');
        return;
      }

      const decision = evaluateChargePointAuth(authConfig, identity, handshake.password);
      if (!decision.accepted) {
        this.logger.warn(
          `OCPP handshake rejected for identity ${identity} (mode: ${authConfig.mode})`,
        );
        reject(OCPP_AUTH_REJECT_CODE, decision.reason);
        return;
      }

      // No explicit protocol is passed: `ocpp-rpc` then negotiates the first subprotocol in
      // OCPP_PROTOCOLS (server preference order) that the charge point also offered, so 1.6
      // and 2.0.1 clients are accepted on the same listener.
      accept({
        connectedAt: new Date().toISOString(),
        endpoint: handshake.endpoint,
      });
    });
    this.rpcServer.on('client', (client) => {
      this.onClientConnected(client as OcppServerClient);
    });
    this.rpcServer.on('error', (error) => {
      const message = error instanceof Error ? error.message : 'Unknown OCPP server error';
      this.logger.error(`OCPP server error: ${message}`);
    });

    const host = resolveOcppHost(process.env.OCPP_WS_HOST);
    const port = resolveOcppPort(process.env.OCPP_WS_PORT);

    if (tlsPaths === null) {
      await this.rpcServer.listen(port, host);
      this.logger.log(`OCPP central system listening on ws://${host}:${port}`);
      return;
    }

    await this.listenWithTls(this.rpcServer, tlsPaths, host, port);
    this.logger.log(`OCPP central system listening on wss://${host}:${port}`);
  }

  /** Gracefully closes the OCPP server and disconnects charge points on module shutdown. */
  public async onModuleDestroy(): Promise<void> {
    if (this.rpcServer === null) {
      return;
    }

    await this.rpcServer.close({
      awaitPending: false,
      code: OCPP_CLOSE_CODE_GOING_AWAY,
      reason: OCPP_SHUTDOWN_REASON,
    });
    this.rpcServer = null;

    if (this.tlsServer !== null) {
      const tlsServer = this.tlsServer;
      this.tlsServer = null;
      await new Promise<void>((resolve) => {
        tlsServer.close(() => {
          resolve();
        });
        tlsServer.closeAllConnections();
      });
    }
  }

  /**
   * Terminates TLS locally by attaching the `ocpp-rpc` upgrade handler to an HTTPS server.
   *
   * `RPCServer#listen` always creates a plain HTTP server internally, so for `wss://` support the
   * server is bound through the library's exposed `handleUpgrade` hook instead (the documented
   * pattern for external HTTP(S) servers).
   */
  private async listenWithTls(
    rpcServer: OcppServer,
    tlsPaths: OcppTlsPaths,
    host: string,
    port: number,
  ): Promise<void> {
    const tlsServer = this.serverFactory.createTlsServer({
      cert: readFileSync(tlsPaths.certPath),
      key: readFileSync(tlsPaths.keyPath),
    });
    tlsServer.on('upgrade', (request, socket, head) => {
      void rpcServer.handleUpgrade(request, socket, head);
    });
    tlsServer.on('error', (error: Error) => {
      this.logger.error(`OCPP TLS server error: ${error.message}`);
    });
    this.tlsServer = tlsServer;

    await new Promise<void>((resolve, reject) => {
      tlsServer.once('error', reject);
      tlsServer.listen(port, host, () => {
        tlsServer.removeListener('error', reject);
        resolve();
      });
    });
  }

  /**
   * Handles accepted OCPP client connections by registering and wiring routing callbacks.
   *
   * The action router is selected per client from the negotiated WebSocket subprotocol:
   * `ocpp2.0.1` clients get the TransactionEvent-based 2.0.1 router, everything else falls back
   * to the 1.6-J router (the default and first-preference subprotocol).
   */
  private onClientConnected(client: OcppServerClient): void {
    const registration = this.registryService.registerChargePoint(client);

    if (client.protocol === OCPP_PROTOCOL_2_0_1) {
      this.ocpp2RoutingService.attachClientHandlers(client);
    } else {
      this.routingService.attachClientHandlers(client);
    }

    this.logger.log(
      `Charge point connected: ${registration.identity} (${client.protocol ?? 'unknown protocol'})`,
    );

    const unregisterClient = (): void => {
      const wasRemoved = this.registryService.unregisterChargePoint(registration.identity);

      if (wasRemoved) {
        this.logger.log(`Charge point disconnected: ${registration.identity}`);
        void this.reportActiveSessionsOnDisconnect(registration.identity);
      }
    };

    client.on('disconnect', unregisterClient);
    client.on('close', unregisterClient);
  }

  /**
   * Surfaces ACTIVE sessions left behind when a charge point drops its WebSocket connection.
   *
   * Design decision (deliberately minimal): the charge point is marked disconnected by removing it
   * from the registry (done by the caller), and any in-flight sessions are logged loudly instead of
   * being force-failed. Sessions stay ACTIVE so they resolve through one of the existing paths:
   * - the charge point reconnects (re-registration is automatic on the next handshake) and later
   *   sends StopTransaction, which finalizes the session with real meter data; or
   * - the user stops the session via the API, whose remote-stop dispatch already tolerates an
   *   offline charge point and finalizes the session server-side.
   * A full offline watchdog (auto-failing sessions after a disconnect grace period, operator
   * alerting, reconciliation of missed StopTransactions) is intentionally out of scope here and
   * tracked as follow-up work.
   */
  private async reportActiveSessionsOnDisconnect(chargePointId: string): Promise<void> {
    try {
      const activeSessions = await this.prismaService.session.findMany({
        where: {
          status: SessionStatus.ACTIVE,
          connector: {
            station: {
              operatorId: chargePointId,
            },
          },
        },
        select: { id: true },
      });

      if (activeSessions.length === 0) {
        return;
      }

      const sessionIds = activeSessions.map((session) => session.id).join(', ');
      this.logger.warn(
        `Charge point ${chargePointId} disconnected with ${activeSessions.length} ACTIVE session(s): ` +
          `${sessionIds}. Sessions remain ACTIVE and will finalize on charge point reconnect ` +
          '(StopTransaction) or via API stop (server-side finalization).',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown lookup error';
      this.logger.error(
        `Failed to inspect ACTIVE sessions after ${chargePointId} disconnected: ${message}`,
      );
    }
  }
}
