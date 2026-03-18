import type {
  OcppRemoteStopTransactionRequest,
  OcppRemoteStopTransactionResponse,
  OcppRemoteStopTransactionResponseStatus,
} from '@lilocharge/shared-types';
import { OcppAction } from '@lilocharge/shared-types';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { OcppRegistryService } from './ocpp.registry.service';
import type { OcppRpcCallOptions, OcppServerClient } from './ocpp.server.types';

const DEFAULT_REMOTE_STOP_MAX_ATTEMPTS = 3;
const DEFAULT_REMOTE_STOP_RETRY_DELAY_MS = 300;
const DEFAULT_REMOTE_STOP_TIMEOUT_MS = 10_000;

const INVALID_CALL_HANDLER_MESSAGE =
  'RemoteStopTransaction cannot be sent because the charge point client is missing a call handler';

/** Input payload used to dispatch one outbound OCPP RemoteStopTransaction command. */
export interface OcppRemoteStopCommand {
  readonly chargePointId: string;
  readonly maxAttempts?: number;
  readonly payload: OcppRemoteStopTransactionRequest;
  readonly retryDelayMs?: number;
  readonly timeoutMs?: number;
}

/** Result metadata returned after executing one outbound RemoteStopTransaction command flow. */
export interface OcppRemoteStopResult {
  readonly attemptCount: number;
  readonly chargePointId: string;
  readonly status: OcppRemoteStopTransactionResponseStatus;
}

/** Service responsible for outbound OCPP RemoteStopTransaction commands with retry/timeout handling. */
@Injectable()
export class OcppRemoteStopService {
  private readonly logger: Logger = new Logger(OcppRemoteStopService.name);

  constructor(private readonly registryService: OcppRegistryService) {}

  /** Sends one outbound RemoteStopTransaction command with retry/timeout handling. */
  public async remoteStopTransaction(
    command: OcppRemoteStopCommand,
  ): Promise<OcppRemoteStopResult> {
    assertRemoteStopPayload(command.payload);
    const registration = this.registryService.getChargePoint(command.chargePointId);

    if (registration === null) {
      throw new NotFoundException(`Charge point ${command.chargePointId} is not connected`);
    }

    const client = registration.client;
    const call = resolveClientCall(client);
    const maxAttempts = resolvePositiveInteger(
      command.maxAttempts,
      DEFAULT_REMOTE_STOP_MAX_ATTEMPTS,
      'maxAttempts',
    );
    const retryDelayMs = resolveNonNegativeInteger(
      command.retryDelayMs,
      DEFAULT_REMOTE_STOP_RETRY_DELAY_MS,
      'retryDelayMs',
    );
    const timeoutMs = resolvePositiveInteger(
      command.timeoutMs,
      DEFAULT_REMOTE_STOP_TIMEOUT_MS,
      'timeoutMs',
    );
    let lastError: unknown;

    for (let attemptCount = 1; attemptCount <= maxAttempts; attemptCount += 1) {
      try {
        const response = await call<OcppRemoteStopTransactionResponse>(
          OcppAction.REMOTE_STOP_TRANSACTION,
          command.payload,
          {
            callTimeoutMs: timeoutMs,
          },
        );
        const remoteStopResponse = parseRemoteStopResponse(response);

        if (remoteStopResponse === null) {
          throw new Error('Charge point returned an invalid RemoteStopTransaction response');
        }

        if (remoteStopResponse.status === 'Rejected') {
          return {
            attemptCount,
            chargePointId: command.chargePointId,
            status: 'Rejected',
          };
        }

        return {
          attemptCount,
          chargePointId: command.chargePointId,
          status: 'Accepted',
        };
      } catch (error: unknown) {
        lastError = error;
        const message = resolveErrorMessage(error);
        this.logger.warn(
          `RemoteStopTransaction attempt ${attemptCount}/${maxAttempts} failed for ${command.chargePointId} transaction ${command.payload.transactionId}: ${message}`,
        );

        if (attemptCount === maxAttempts) {
          break;
        }

        await sleep(retryDelayMs);
      }
    }

    throw new ServiceUnavailableException(
      `RemoteStopTransaction failed for ${command.chargePointId} transaction ${command.payload.transactionId}: ${resolveErrorMessage(lastError)}`,
    );
  }
}

/** Validates one RemoteStopTransaction request payload before dispatching outbound RPC calls. */
function assertRemoteStopPayload(payload: OcppRemoteStopTransactionRequest): void {
  if (!Number.isInteger(payload.transactionId) || payload.transactionId <= 0) {
    throw new BadRequestException('RemoteStopTransaction transactionId must be a positive integer');
  }
}

/** Resolves and validates one positive-integer option value with fallback defaults. */
function resolvePositiveInteger(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} must be a positive integer`);
  }

  return value;
}

/** Resolves and validates one non-negative integer option value with fallback defaults. */
function resolveNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

/** Resolves an outbound OCPP client call function from one charge-point client instance. */
function resolveClientCall(
  client: OcppServerClient,
): <TResponse>(
  method: string,
  params?: unknown,
  options?: OcppRpcCallOptions,
) => Promise<TResponse> {
  if (client.call === undefined) {
    throw new ServiceUnavailableException(INVALID_CALL_HANDLER_MESSAGE);
  }

  return <TResponse>(
    method: string,
    params?: unknown,
    options?: OcppRpcCallOptions,
  ): Promise<TResponse> => {
    return client.call?.(method, params, options) as Promise<TResponse>;
  };
}

/** Parses one raw outbound RemoteStopTransaction response payload into a typed response object. */
function parseRemoteStopResponse(payload: unknown): OcppRemoteStopTransactionResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const response = payload as { readonly status?: unknown };

  if (response.status !== 'Accepted' && response.status !== 'Rejected') {
    return null;
  }

  return {
    status: response.status,
  };
}

/** Resolves a safe log/error message from an unknown thrown value. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown remote-stop error';
}

/** Waits for one retry interval in milliseconds. */
async function sleep(delayMs: number): Promise<void> {
  if (delayMs === 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
