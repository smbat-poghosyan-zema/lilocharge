import {
  BadGatewayException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Injection token used for optional Apple Pay client configuration overrides. */
export const APPLE_PAY_CLIENT_OPTIONS = 'APPLE_PAY_CLIENT_OPTIONS';

/** Supported request payload for Apple Pay token exchange operations. */
export interface ApplePayTokenExchangeRequest {
  readonly paymentToken: string;
  readonly transactionIdentifier: string;
}

/** Standard response payload returned by Apple Pay token exchange operations. */
export interface ApplePayTokenExchangeResult {
  readonly network: string | null;
  readonly paymentMethodToken: string;
}

interface ApplePayClientOptions {
  readonly apiKey?: string;
  readonly fetchFn?: typeof fetch;
  readonly merchantIdentifier?: string;
  readonly tokenExchangeUrl?: string;
}

interface ApplePayTokenExchangeEnvelope {
  readonly network: string | null;
  readonly token: string;
}

/** API client responsible for exchanging Apple Pay payment tokens into storable payment method tokens. */
@Injectable()
export class ApplePayClient {
  private readonly apiKey: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly merchantIdentifier: string | undefined;
  private readonly tokenExchangeUrl: string | undefined;

  constructor(
    @Optional()
    @Inject(APPLE_PAY_CLIENT_OPTIONS)
    options?: ApplePayClientOptions,
  ) {
    this.apiKey = normalizeOptionalString(options?.apiKey ?? process.env.APPLE_PAY_API_KEY);
    this.fetchFn = options?.fetchFn ?? fetch;
    this.merchantIdentifier = normalizeOptionalString(
      options?.merchantIdentifier ?? process.env.APPLE_PAY_MERCHANT_IDENTIFIER,
    );
    this.tokenExchangeUrl = normalizeOptionalString(
      options?.tokenExchangeUrl ?? process.env.APPLE_PAY_TOKEN_EXCHANGE_URL,
    );
  }

  /**
   * Exchanges one Apple Pay payment token for a PSP payment-method token.
   * Requires APPLE_PAY_TOKEN_EXCHANGE_URL to be configured; there is deliberately
   * no local fallback because fabricated tokens would later be sent to ArCa as
   * real card tokens and silently fail (or worse, charge the wrong instrument).
   */
  public async exchangeToken(
    request: ApplePayTokenExchangeRequest,
  ): Promise<ApplePayTokenExchangeResult> {
    if (this.tokenExchangeUrl === undefined) {
      throw new ServiceUnavailableException(
        'Apple Pay token exchange is not configured (set APPLE_PAY_TOKEN_EXCHANGE_URL)',
      );
    }

    const merchantIdentifier = resolveMerchantIdentifier({
      merchantIdentifier: this.merchantIdentifier,
    });

    const payload = await this.postJson(this.tokenExchangeUrl, {
      merchantIdentifier,
      paymentData: request.paymentToken,
      transactionIdentifier: request.transactionIdentifier,
    });
    const envelope = parseApplePayTokenExchangeEnvelope(payload);

    return {
      network: envelope.network,
      paymentMethodToken: envelope.token,
    };
  }

  /** Sends one authenticated JSON POST request and returns parsed response payload. */
  private async postJson(url: string, payload: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        body: JSON.stringify(payload),
        headers: buildRequestHeaders(this.apiKey),
        method: 'POST',
      });
    } catch (error: unknown) {
      throw new ServiceUnavailableException(
        `Apple Pay token exchange failed: ${resolveErrorMessage(error)}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Apple Pay token exchange failed with status ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('Apple Pay token exchange returned invalid JSON payload');
    }
  }
}

/** Resolves mandatory Apple Pay merchant identifier and fails loudly when missing. */
function resolveMerchantIdentifier(input: {
  readonly merchantIdentifier: string | undefined;
}): string {
  if (input.merchantIdentifier === undefined) {
    throw new InternalServerErrorException(
      'Missing required environment variable(s): APPLE_PAY_MERCHANT_IDENTIFIER',
    );
  }

  return input.merchantIdentifier;
}

/** Builds JSON request headers, attaching API key only when configured. */
function buildRequestHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (apiKey !== undefined) {
    headers['X-Api-Key'] = apiKey;
  }

  return headers;
}

/** Parses one Apple Pay token exchange response envelope and validates required token field. */
function parseApplePayTokenExchangeEnvelope(payload: unknown): ApplePayTokenExchangeEnvelope {
  if (!isRecord(payload)) {
    throw new BadGatewayException('Apple Pay token exchange response must be an object');
  }

  const token = readString(payload, 'token') ?? readString(payload, 'paymentMethodToken');
  const network = readString(payload, 'network') ?? null;

  if (token === undefined) {
    throw new BadGatewayException('Apple Pay token exchange response is missing payment token');
  }

  return {
    network,
    token,
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
