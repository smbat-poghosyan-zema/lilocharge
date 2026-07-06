import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

const DEFAULT_IDRAM_BASE_URL = 'https://wallet.idram.am/api/v1';

/** Injection token used for optional Idram client configuration overrides. */
export const IDRAM_CLIENT_OPTIONS = 'IDRAM_CLIENT_OPTIONS';

/** Supported request payload for Idram wallet balance checks. */
export interface IdramBalanceRequest {
  readonly currency: 'AMD';
  readonly walletToken: string;
}

/** Supported request payload for Idram wallet debit operations. */
export interface IdramDebitWalletRequest {
  readonly amount: number;
  readonly currency: 'AMD';
  readonly description?: string;
  readonly idempotencyKey?: string;
  readonly orderId: string;
  readonly walletToken: string;
}

/** Supported request payload for Idram wallet refund operations. */
export interface IdramRefundRequest {
  readonly amount: number;
  readonly gatewayTransactionId: string;
  readonly idempotencyKey?: string;
}

/** Standard response payload returned by Idram wallet operations carrying transaction id metadata. */
export interface IdramGatewayOperationResult {
  readonly gatewayTransactionId: string;
}

/** Standard response payload returned by Idram balance operation. */
export interface IdramBalanceResult {
  readonly balance: number;
}

interface IdramClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

interface ExecuteOperationInput {
  readonly allowedStatuses: readonly string[];
  readonly declinedErrorMessage: string;
  readonly endpointPath: string;
  readonly idempotencyKey?: string;
  readonly payload: Record<string, unknown>;
}

interface IdramOperationEnvelope {
  readonly status: string;
  readonly transactionId: string;
}

interface IdramBalanceEnvelope {
  readonly balance: number;
  readonly status: string;
}

/** API client responsible for Idram wallet balance, debit, and refund calls. */
@Injectable()
export class IdramClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    @Optional()
    @Inject(IDRAM_CLIENT_OPTIONS)
    options?: IdramClientOptions,
  ) {
    this.apiKey = normalizeOptionalString(options?.apiKey ?? process.env.IDRAM_API_KEY);
    this.baseUrl = options?.baseUrl ?? process.env.IDRAM_BASE_URL ?? DEFAULT_IDRAM_BASE_URL;
    this.fetchFn = options?.fetchFn ?? fetch;
  }

  /** Checks one Idram wallet balance and returns available amount in minor units (AMD luma). */
  public async getBalance(request: IdramBalanceRequest): Promise<IdramBalanceResult> {
    const payload = await this.postJson('/wallets/balance', {
      currency: request.currency,
      walletToken: request.walletToken,
    });
    const envelope = parseIdramBalanceEnvelope(payload);

    if (!['APPROVED', 'OK', 'SUCCESS'].includes(envelope.status)) {
      throw new BadRequestException('Idram balance check was declined');
    }

    return {
      balance: envelope.balance,
    };
  }

  /** Sends one Idram wallet debit request and returns the gateway transaction id. */
  public async debitWallet(request: IdramDebitWalletRequest): Promise<IdramGatewayOperationResult> {
    return this.executeOperation({
      allowedStatuses: ['APPROVED', 'CAPTURED', 'SUCCESS'],
      declinedErrorMessage: 'Idram wallet debit was declined',
      endpointPath: '/wallets/debit',
      idempotencyKey: request.idempotencyKey,
      payload: {
        amount: request.amount,
        currency: request.currency,
        description: request.description,
        orderId: request.orderId,
        walletToken: request.walletToken,
      },
    });
  }

  /** Sends one Idram wallet refund request and returns the gateway transaction id. */
  public async refund(request: IdramRefundRequest): Promise<IdramGatewayOperationResult> {
    return this.executeOperation({
      allowedStatuses: ['APPROVED', 'REFUNDED', 'SUCCESS'],
      declinedErrorMessage: 'Idram wallet refund was declined',
      endpointPath: '/wallets/refund',
      idempotencyKey: request.idempotencyKey,
      payload: {
        amount: request.amount,
        transactionId: request.gatewayTransactionId,
      },
    });
  }

  /** Executes one Idram operation, validates response status, and returns transaction id metadata. */
  private async executeOperation(
    input: ExecuteOperationInput,
  ): Promise<IdramGatewayOperationResult> {
    const payload = await this.postJson(input.endpointPath, input.payload, input.idempotencyKey);
    const envelope = parseIdramOperationEnvelope(payload);

    if (!input.allowedStatuses.includes(envelope.status)) {
      throw new BadRequestException(input.declinedErrorMessage);
    }

    return {
      gatewayTransactionId: envelope.transactionId,
    };
  }

  /**
   * Sends one authenticated JSON POST request to Idram and returns parsed response payload.
   * When an idempotency key is supplied it is forwarded via the `Idempotency-Key` header so
   * retried operations are deduplicated by the gateway.
   */
  private async postJson(
    endpointPath: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const apiKey = resolveGatewayCredentials({
      apiKey: this.apiKey,
    });

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    };

    if (idempotencyKey !== undefined) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchFn(buildIdramRequestUrl(this.baseUrl, endpointPath), {
        body: JSON.stringify(payload),
        headers,
        method: 'POST',
      });
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `Idram gateway request failed: ${resolveErrorMessage(error)}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(`Idram gateway request failed with status ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('Idram gateway returned invalid JSON payload');
    }
  }
}

/** Parses one Idram operation response envelope and validates required status/transaction identifiers. */
function parseIdramOperationEnvelope(payload: unknown): IdramOperationEnvelope {
  if (!isRecord(payload)) {
    throw new BadGatewayException('Idram gateway response must be an object');
  }

  const status = readString(payload, 'status');
  const transactionId = resolveTransactionId(payload);

  if (status === undefined || transactionId === undefined) {
    throw new BadGatewayException('Idram gateway response is missing status or transaction id');
  }

  return {
    status,
    transactionId,
  };
}

/** Parses one Idram balance response envelope and validates required status/balance fields. */
function parseIdramBalanceEnvelope(payload: unknown): IdramBalanceEnvelope {
  if (!isRecord(payload)) {
    throw new BadGatewayException('Idram gateway response must be an object');
  }

  const status = readString(payload, 'status');
  const balance =
    readFiniteNumber(payload, 'balance') ??
    readFiniteNumber(payload, 'availableBalance') ??
    readFiniteNumber(payload, 'available_balance');

  if (status === undefined || balance === undefined) {
    throw new BadGatewayException('Idram gateway response is missing status or balance');
  }

  return {
    balance,
    status,
  };
}

/** Resolves mandatory Idram credentials and fails loudly when missing. */
function resolveGatewayCredentials(input: { readonly apiKey: string | undefined }): string {
  if (input.apiKey === undefined) {
    throw new InternalServerErrorException(
      'Missing required environment variable(s): IDRAM_API_KEY',
    );
  }

  return input.apiKey;
}

/** Reads Idram transaction id from known response fields. */
function resolveTransactionId(payload: Record<string, unknown>): string | undefined {
  return (
    readString(payload, 'transactionId') ??
    readString(payload, 'transaction_id') ??
    readString(payload, 'paymentId') ??
    readString(payload, 'payment_id') ??
    readString(payload, 'operationId') ??
    readString(payload, 'operation_id')
  );
}

/** Type guard for unknown values expected to be JSON object maps. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads one object property as a string when available. */
function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** Reads one object property as a finite number or numeric string when available. */
function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

/** Normalizes optional string values by trimming and removing empty content. */
function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
}

/** Resolves a safe log-ready message for unknown thrown values. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown transport error';
}

/** Builds one stable Idram request URL while preserving optional base-path segments. */
function buildIdramRequestUrl(baseUrl: string, endpointPath: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedEndpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  return `${normalizedBaseUrl}${normalizedEndpointPath}`;
}
