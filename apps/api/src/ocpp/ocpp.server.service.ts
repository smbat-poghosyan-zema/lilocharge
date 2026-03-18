import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import {
  DEFAULT_OCPP_HOST,
  DEFAULT_OCPP_PORT,
  DISABLED_FLAG_VALUES,
  OCPP_PROTOCOLS,
} from './ocpp.constants';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRoutingService } from './ocpp.routing.service';
import { OcppServerFactory } from './ocpp.server.factory';
import type { OcppServer, OcppServerClient } from './ocpp.server.types';

const MAX_PORT = 65535;
const OCPP_CLOSE_CODE_GOING_AWAY = 1001;
const OCPP_SHUTDOWN_REASON = 'LiloCharge OCPP server shutdown';

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

/** Lifecycle-managed central-system WebSocket server for OCPP 1.6-J charge point connectivity. */
@Injectable()
export class OcppServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(OcppServerService.name);
  private rpcServer: OcppServer | null = null;

  constructor(
    private readonly routingService: OcppRoutingService,
    private readonly registryService: OcppRegistryService,
    private readonly serverFactory: OcppServerFactory,
  ) {}

  /** Starts the OCPP WebSocket server and binds connection, auth, and routing handlers. */
  public async onModuleInit(): Promise<void> {
    if (!isOcppServerEnabled(process.env.OCPP_WS_ENABLED)) {
      this.logger.log('OCPP server startup skipped because OCPP_WS_ENABLED is disabled');
      return;
    }

    this.rpcServer = this.serverFactory.createServer({
      protocols: [...OCPP_PROTOCOLS],
      strictMode: true,
    });
    this.rpcServer.auth((accept, reject, handshake) => {
      const identity = handshake.identity.trim();

      if (identity.length === 0) {
        reject(401, 'Charge point identity is required');
        return;
      }

      accept(
        {
          connectedAt: new Date().toISOString(),
          endpoint: handshake.endpoint,
        },
        OCPP_PROTOCOLS[0],
      );
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
    await this.rpcServer.listen(port, host);

    this.logger.log(`OCPP central system listening on ws://${host}:${port}`);
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
  }

  /** Handles accepted OCPP client connections by registering and wiring routing callbacks. */
  private onClientConnected(client: OcppServerClient): void {
    const registration = this.registryService.registerChargePoint(client);
    this.routingService.attachClientHandlers(client);
    this.logger.log(`Charge point connected: ${registration.identity}`);

    const unregisterClient = (): void => {
      const wasRemoved = this.registryService.unregisterChargePoint(registration.identity);

      if (wasRemoved) {
        this.logger.log(`Charge point disconnected: ${registration.identity}`);
      }
    };

    client.on('disconnect', unregisterClient);
    client.on('close', unregisterClient);
  }
}
