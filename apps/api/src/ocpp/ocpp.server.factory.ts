import { createServer, type Server as HttpsServer } from 'node:https';

import { Injectable } from '@nestjs/common';
import { RPCServer } from 'ocpp-rpc';

import type { OcppServer } from './ocpp.server.types';

/** Options used when creating an `ocpp-rpc` central-system server instance. */
export interface OcppServerFactoryOptions {
  readonly protocols: readonly string[];
  readonly strictMode: boolean;
}

/** TLS key material used to create one HTTPS server that terminates `wss://` connections. */
export interface OcppTlsServerOptions {
  readonly cert: Buffer;
  readonly key: Buffer;
}

/** Factory creating typed `ocpp-rpc` server instances for the OCPP module. */
@Injectable()
export class OcppServerFactory {
  /** Creates a new OCPP RPC server with module-level defaults and selected options. */
  public createServer(options: OcppServerFactoryOptions): OcppServer {
    return new RPCServer({
      protocols: [...options.protocols],
      strictMode: options.strictMode,
    }) as unknown as OcppServer;
  }

  /** Creates one HTTPS server used to terminate TLS for `wss://` OCPP connections. */
  public createTlsServer(options: OcppTlsServerOptions): HttpsServer {
    return createServer({
      cert: options.cert,
      key: options.key,
    });
  }
}
