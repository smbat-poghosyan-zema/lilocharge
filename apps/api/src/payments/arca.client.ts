import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

const DEFAULT_ARCA_BASE_URL = 'https://payments.arca.am/api/v1';

/** Injection token used for optional ArCa client configuration overrides. */
export const ARCA_CLIENT_OPTIONS = 'ARCA_CLIENT_OPTIONS';

/** Supported request payload for ArCa pre-authorization operations. */
export interface ArcaPreAuthorizeRequest {
  readonly amount: number;
  readonly cardToken: string;
  readonly currency: 'AMD';
  readonly description?: string;
  readonly orderId: string;
}

/** Supported request payload for ArCa capture operations. */
export interface ArcaCaptureRequest {
  readonly amount: number;
  readonly gatewayTransactionId: string;
}

/** Supported request payload for ArCa refund operations. */
export interface ArcaRefundRequest {
  readonly amount: number;
  readonly gatewayTransactionId: string;
}

/** Standard response payload returned by ArCa client operations. */
export interface ArcaGatewayOperationResult {
  readonly gatewayTransactionId: string;
}

interface ArcaClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly merchantId?: string;
}

interface ArcaOperationEnvelope {
  readonly status: string;
  readonly transactionId: string;
}

interface ExecuteOperationInput {
  readonly allowedStatuses: readonly string[];
  readonly declinedErrorMessage: string;
  readonly endpointPath: string;
  readonly payload: Record<string, unknown>;
}

/** API client responsible for ArCa payment gateway pre-auth, capture, and refund calls. */
@Injectable()
export class ArcaClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly merchantId: string | undefined;

  constructor(
    @Optional()
    @Inject(ARCA_CLIENT_OPTIONS)
    options?: ArcaClientOptions,
  ) {
    this.apiKey = normalizeOptionalString(options?.apiKey ?? process.env.ARCA_API_KEY);
    this.baseUrl = options?.baseUrl ?? process.env.ARCA_BASE_URL ?? DEFAULT_ARCA_BASE_URL;
    this.fetchFn = options?.fetchFn ?? fetch;
    this.merchantId = normalizeOptionalString(options?.merchantId ?? process.env.ARCA_MERCHANT_ID);
  }

  /** Sends one pre-authorization request to ArCa and returns the gateway transaction id. */
  public async preAuthorize(request: ArcaPreAuthorizeRequest): Promise<ArcaGatewayOperationResult> {
    return this.executeOperation({
      allowedStatuses: ['APPROVED', 'AUTHORIZED'],
      declinedErrorMessage: 'ArCa pre-authorization was declined',
      endpointPath: '/payments/preauthorize',
      payload: {
        amount: request.amount,
        cardToken: request.cardToken,
        currency: request.currency,
        description: request.description,
        orderId: request.orderId,
      },
    });
  }

  /** Sends one capture request to ArCa and returns the gateway transaction id. */
  public async capture(request: ArcaCaptureRequest): Promise<ArcaGatewayOperationResult> {
    return this.executeOperation({
      allowedStatuses: ['APPROVED', 'CAPTURED'],
      declinedErrorMessage: 'ArCa capture was declined',
      endpointPath: '/payments/capture',
      payload: {
        amount: request.amount,
        transactionId: request.gatewayTransactionId,
      },
    });
  }

  /** Sends one refund request to ArCa and returns the gateway transaction id. */
  public async refund(request: ArcaRefundRequest): Promise<ArcaGatewayOperationResult> {
    return this.executeOperation({
      allowedStatuses: ['APPROVED', 'REFUNDED'],
      declinedErrorMessage: 'ArCa refund was declined',
      endpointPath: '/payments/refund',
      payload: {
        amount: request.amount,
        transactionId: request.gatewayTransactionId,
      },
    });
  }

  /** Executes one ArCa operation, validates response status, and returns transaction id metadata. */
  private async executeOperation(
    input: ExecuteOperationInput,
  ): Promise<ArcaGatewayOperationResult> {
    const payload = await this.postJson(input.endpointPath, input.payload);
    const envelope = parseArcaOperationEnvelope(payload);

    if (!input.allowedStatuses.includes(envelope.status)) {
      throw new BadRequestException(input.declinedErrorMessage);
    }

    return {
      gatewayTransactionId: envelope.transactionId,
    };
  }

  /** Sends one authenticated JSON POST request to ArCa and returns parsed response payload. */
  private async postJson(endpointPath: string, payload: Record<string, unknown>): Promise<unknown> {
    const { apiKey, merchantId } = resolveGatewayCredentials({
      apiKey: this.apiKey,
      merchantId: this.merchantId,
    });

    let response: Response;
    try {
      response = await this.fetchFn(buildArcaRequestUrl(this.baseUrl, endpointPath), {
        body: JSON.stringify(payload),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Merchant-Id': merchantId,
        },
        method: 'POST',
      });
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `ArCa gateway request failed: ${resolveErrorMessage(error)}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(`ArCa gateway request failed with status ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('ArCa gateway returned invalid JSON payload');
    }
  }
}

/** Parses one ArCa response envelope and validates required status/transaction identifiers. */
function parseArcaOperationEnvelope(payload: unknown): ArcaOperationEnvelope {
  if (!isRecord(payload)) {
    throw new BadGatewayException('ArCa gateway response must be an object');
  }

  const status = readString(payload, 'status');
  const camelCaseTransactionId = readString(payload, 'transactionId');
  const snakeCaseTransactionId = readString(payload, 'transaction_id');
  const transactionId = camelCaseTransactionId ?? snakeCaseTransactionId;

  if (status === undefined || transactionId === undefined) {
    throw new BadGatewayException('ArCa gateway response is missing status or transaction id');
  }

  return {
    status,
    transactionId,
  };
}

/** Resolves mandatory ArCa credentials and fails loudly when missing. */
function resolveGatewayCredentials(input: {
  readonly apiKey: string | undefined;
  readonly merchantId: string | undefined;
}): {
  readonly apiKey: string;
  readonly merchantId: string;
} {
  const missingVariables: string[] = [];

  if (input.apiKey === undefined) {
    missingVariables.push('ARCA_API_KEY');
  }
  if (input.merchantId === undefined) {
    missingVariables.push('ARCA_MERCHANT_ID');
  }

  if (missingVariables.length > 0) {
    throw new InternalServerErrorException(
      `Missing required environment variable(s): ${missingVariables.join(', ')}`,
    );
  }

  const apiKey = input.apiKey;
  const merchantId = input.merchantId;

  if (apiKey === undefined || merchantId === undefined) {
    throw new InternalServerErrorException(
      `Missing required environment variable(s): ${missingVariables.join(', ')}`,
    );
  }

  return {
    apiKey,
    merchantId,
  };
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

/** Builds one stable ArCa request URL while preserving optional base-path segments. */
function buildArcaRequestUrl(baseUrl: string, endpointPath: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedEndpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  return `${normalizedBaseUrl}${normalizedEndpointPath}`;
}
