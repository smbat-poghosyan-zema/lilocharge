import {
  BadGatewayException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ApplePayClient } from './apple-pay.client';

interface MockResponseConfig {
  readonly payload: unknown;
  readonly status?: number;
}

/** Builds one minimal fetch Response mock carrying JSON payload and HTTP status. */
function buildResponse(config: MockResponseConfig): Response {
  const status = config.status ?? 200;

  return {
    json: jest.fn<Promise<unknown>, []>().mockResolvedValue(config.payload),
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

describe('ApplePayClient', () => {
  it('exchanges one Apple Pay payment token through configured gateway endpoint', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            network: 'visa',
            token: 'gateway-card-token-1',
          },
        }),
      );
    const client = new ApplePayClient({
      apiKey: 'apple-pay-api-key',
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
      tokenExchangeUrl: 'https://apple-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    ).resolves.toEqual({
      network: 'visa',
      paymentMethodToken: 'gateway-card-token-1',
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect(requestUrl).toBe('https://apple-pay-gateway.test/v1/tokens/exchange');

    const request = requestInit as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Api-Key': 'apple-pay-api-key',
      }),
    );
    expect(request.body).toBe(
      JSON.stringify({
        merchantIdentifier: 'merchant.com.lilocharge',
        paymentData: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    );
  });

  it('requires merchant identifier when calling remote token exchange endpoint', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    const client = new ApplePayClient({
      fetchFn: fetchMock,
      tokenExchangeUrl: 'https://apple-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws service unavailable instead of fabricating tokens when exchange URL is not configured', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    const client = new ApplePayClient({
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    ).rejects.toThrow('Apple Pay token exchange is not configured (set APPLE_PAY_TOKEN_EXCHANGE_URL)');
    await expect(
      client.exchangeToken({
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws bad gateway when remote token exchange returns non-success status', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            message: 'Internal error',
          },
          status: 502,
        }),
      );
    const client = new ApplePayClient({
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
      tokenExchangeUrl: 'https://apple-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws service unavailable when remote token exchange transport fails', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('network timeout'));
    const client = new ApplePayClient({
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
      tokenExchangeUrl: 'https://apple-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'apple-pay-payment-token',
        transactionIdentifier: 'apple-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
