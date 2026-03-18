import { Injectable } from '@nestjs/common';
import { RPCServer } from 'ocpp-rpc';

import type { OcppServer } from './ocpp.server.types';

/** Options used when creating an `ocpp-rpc` central-system server instance. */
export interface OcppServerFactoryOptions {
  readonly protocols: readonly string[];
  readonly strictMode: boolean;
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
}
