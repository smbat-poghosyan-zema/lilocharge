import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import type { IHandlersOption } from 'ocpp-rpc';

/** Function signature used for OCPP RPC message handlers. */
export type OcppRpcHandler = (payload: IHandlersOption) => unknown;

/** Call options supported by `ocpp-rpc` outbound requests from the central system. */
export interface OcppRpcCallOptions {
  readonly callTimeoutMs?: number;
  readonly noReply?: boolean;
  readonly signal?: AbortSignal;
}

/** Lightweight handshake metadata required by the OCPP server lifecycle. */
export interface OcppServerHandshake {
  readonly endpoint: string;
  /** Raw HTTP upgrade request headers (populated by `ocpp-rpc` from the WebSocket handshake). */
  readonly headers?: IncomingHttpHeaders;
  readonly identity: string;
  /**
   * HTTP Basic password extracted by `ocpp-rpc`; only set when the Basic username matches the
   * charge-point identity, per the OCPP 1.6 security profile 1 handshake rules.
   */
  readonly password?: Buffer;
  readonly remoteAddress?: string;
}

/** Signature for the OCPP server authentication callback. */
export type OcppServerAuthCallback = (
  accept: (session?: Record<string, unknown>, protocol?: string | false) => void,
  reject: (code: number, message: string) => void,
  handshake: OcppServerHandshake,
  signal?: AbortSignal,
) => void;

/** Shape of an OCPP server client instance consumed by registry and routing services. */
export interface OcppServerClient {
  readonly handshake: { readonly endpoint: string } | undefined;
  readonly identity: string | undefined;
  readonly protocol: string | undefined;
  readonly session: Record<string, unknown> | undefined;

  call?<TResponse = unknown>(
    method: string,
    params?: unknown,
    options?: OcppRpcCallOptions,
  ): Promise<TResponse>;
  handle(method: string | OcppRpcHandler, handler?: OcppRpcHandler): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/** Shape of the OCPP server instance consumed by the Nest service lifecycle. */
export interface OcppServer {
  /**
   * WebSocket upgrade handler exposed by `ocpp-rpc` for attaching the RPC server to an external
   * HTTP(S) server (used for TLS-terminated `wss://` listeners).
   */
  readonly handleUpgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>;

  auth(callback: OcppServerAuthCallback): void;
  close(options?: {
    readonly awaitPending?: boolean;
    readonly code?: number;
    readonly force?: boolean;
    readonly reason?: string;
  }): Promise<void>;
  listen(port: number, host: string): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
}
