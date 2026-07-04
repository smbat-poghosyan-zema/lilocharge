import { ServiceUnavailableException } from '@nestjs/common';

import { SmsService } from './sms.service';

const ACCOUNT_SID = 'AC0000000000000000000000000000test';
const AUTH_TOKEN = 'test-auth-token';
const FROM_NUMBER = '+15005550006';
const TO_NUMBER = '+37477123456';
const MESSAGE_BODY = 'Your LiloCharge verification code is 123456. It expires in 5 minutes.';

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

/** Builds one minimal fetch Response stub for provider call mocking. */
function buildResponse(input: {
  readonly body?: string;
  readonly ok: boolean;
  readonly status: number;
}): Response {
  return {
    ok: input.ok,
    status: input.status,
    text: () => Promise.resolve(input.body ?? ''),
  } as unknown as Response;
}

describe('SmsService', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    delete process.env.SMS_API_BASE_URL;
    delete process.env.SMS_ENABLED;
    delete process.env.SMS_FROM_NUMBER;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;

    fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Applies fully configured provider environment variables for enabled-mode tests. */
  function configureEnabledEnvironment(): void {
    process.env.SMS_ENABLED = 'true';
    process.env.SMS_FROM_NUMBER = FROM_NUMBER;
    process.env.TWILIO_ACCOUNT_SID = ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  }

  it('no-ops without calling the provider when SMS sending is disabled', async () => {
    const service = new SmsService();

    await expect(
      service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats explicit disabled flag values as disabled', async () => {
    process.env.SMS_ENABLED = 'false';
    process.env.SMS_FROM_NUMBER = FROM_NUMBER;
    process.env.TWILIO_ACCOUNT_SID = ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    const service = new SmsService();

    await service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a Twilio-compatible form request with basic auth when enabled', async () => {
    configureEnabledEnvironment();
    fetchMock.mockResolvedValue(buildResponse({ ok: true, status: 201 }));
    const service = new SmsService();

    await service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const rawBody = init?.body;
    if (typeof rawBody !== 'string') {
      throw new Error('Expected the SMS provider request body to be a form-encoded string');
    }

    const parsedBody = new URLSearchParams(rawBody);
    expect(parsedBody.get('Body')).toBe(MESSAGE_BODY);
    expect(parsedBody.get('From')).toBe(FROM_NUMBER);
    expect(parsedBody.get('To')).toBe(TO_NUMBER);
  });

  it('honors a custom Twilio-compatible base URL', async () => {
    configureEnabledEnvironment();
    process.env.SMS_API_BASE_URL = 'https://sms.example.test/v1/';
    fetchMock.mockResolvedValue(buildResponse({ ok: true, status: 201 }));
    const service = new SmsService();

    await service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://sms.example.test/v1/Accounts/${ACCOUNT_SID}/Messages.json`);
  });

  it('throws service unavailable when the provider responds with a client error', async () => {
    configureEnabledEnvironment();
    fetchMock.mockResolvedValue(
      buildResponse({ body: '{"code": 21211}', ok: false, status: 400 }),
    );
    const service = new SmsService();

    await expect(service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws service unavailable when the provider responds with a server error', async () => {
    configureEnabledEnvironment();
    fetchMock.mockResolvedValue(buildResponse({ ok: false, status: 503 }));
    const service = new SmsService();

    await expect(service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws service unavailable when the provider request fails at the network layer', async () => {
    configureEnabledEnvironment();
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service = new SmsService();

    await expect(service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws service unavailable when enabled but provider credentials are missing', async () => {
    process.env.SMS_ENABLED = 'true';
    const service = new SmsService();

    await expect(service.sendSms({ body: MESSAGE_BODY, to: TO_NUMBER })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
