import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { resolveErrorMessage } from '../common/errors';

const DEFAULT_SMS_API_BASE_URL = 'https://api.twilio.com/2010-04-01';
const ENABLED_FLAG_VALUES = ['1', 'true', 'on', 'enabled', 'yes'] as const;

const SMS_SEND_FAILED_MESSAGE = 'SMS delivery failed';

/** Input payload for sending one SMS message. */
export interface SmsSendInput {
  readonly body: string;
  readonly to: string;
}

/**
 * Service responsible for sending transactional SMS messages via a Twilio-compatible REST API.
 *
 * Delivery is env-gated by `SMS_ENABLED` (disabled by default). When disabled the service logs a
 * warning and no-ops so local development and tests keep working without a provider account. When
 * enabled it POSTs to `{SMS_API_BASE_URL}/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json` with HTTP
 * Basic auth (`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`) and a form body, sending from
 * `SMS_FROM_NUMBER`.
 */
@Injectable()
export class SmsService {
  private readonly logger: Logger = new Logger(SmsService.name);
  private readonly accountSid: string;
  private readonly apiBaseUrl: string;
  private readonly authToken: string;
  private readonly enabled: boolean;
  private readonly fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
    this.apiBaseUrl = resolveApiBaseUrl(process.env.SMS_API_BASE_URL);
    this.authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
    this.enabled = isSmsEnabled(process.env.SMS_ENABLED);
    this.fromNumber = process.env.SMS_FROM_NUMBER?.trim() ?? '';

    if (!this.enabled) {
      this.logger.warn('SMS_ENABLED is not set - SMS sending is disabled');
    }
  }

  /**
   * Sends one SMS message through the configured provider.
   *
   * No-ops with a warning log when SMS sending is disabled. When enabled, provider or network
   * failures raise a ServiceUnavailableException so callers never claim delivery succeeded.
   */
  public async sendSms(input: SmsSendInput): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(`SMS sending disabled - skipping message to ${input.to}`);
      return;
    }

    if (this.accountSid.length === 0 || this.authToken.length === 0 || this.fromNumber.length === 0) {
      this.logger.error(
        'SMS_ENABLED is set but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or SMS_FROM_NUMBER is missing',
      );
      throw new ServiceUnavailableException(SMS_SEND_FAILED_MESSAGE);
    }

    const url = `${this.apiBaseUrl}/Accounts/${this.accountSid}/Messages.json`;
    const authorization = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const body = new URLSearchParams({
      Body: input.body,
      From: this.fromNumber,
      To: input.to,
    }).toString();

    let response: Response;

    try {
      response = await fetch(url, {
        body,
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to reach SMS provider: ${resolveErrorMessage(error, 'unknown SMS error')}`,
      );
      throw new ServiceUnavailableException(SMS_SEND_FAILED_MESSAGE);
    }

    if (!response.ok) {
      const responseBody = await readResponseBodySafely(response);
      this.logger.error(
        `SMS provider rejected message to ${input.to} (HTTP ${response.status}): ${responseBody}`,
      );
      throw new ServiceUnavailableException(SMS_SEND_FAILED_MESSAGE);
    }

    this.logger.log(`SMS sent to ${input.to}`);
  }
}

/** Resolves whether SMS sending is enabled from the SMS_ENABLED environment flag. */
function isSmsEnabled(rawFlag: string | undefined): boolean {
  if (rawFlag === undefined) {
    return false;
  }

  const normalizedFlag = rawFlag.trim().toLowerCase();

  return ENABLED_FLAG_VALUES.includes(normalizedFlag as (typeof ENABLED_FLAG_VALUES)[number]);
}

/** Resolves the SMS provider base URL with a Twilio default and no trailing slash. */
function resolveApiBaseUrl(rawBaseUrl: string | undefined): string {
  const normalizedBaseUrl = rawBaseUrl?.trim();

  if (normalizedBaseUrl === undefined || normalizedBaseUrl.length === 0) {
    return DEFAULT_SMS_API_BASE_URL;
  }

  return normalizedBaseUrl.replace(/\/+$/, '');
}

/** Reads one response body for diagnostics without letting read errors mask the send failure. */
async function readResponseBodySafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return 'unreadable response body';
  }
}
