import {
  BadGatewayException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { GooglePayClient } from './google-pay.client';

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

describe('GooglePayClient', () => {
  it('exchanges one Google Pay payment token through configured gateway endpoint', async () => {
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
    const client = new GooglePayClient({
      apiKey: 'google-pay-api-key',
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
      tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      }),
    ).resolves.toEqual({
      network: 'visa',
      paymentMethodToken: 'gateway-card-token-1',
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect(requestUrl).toBe('https://google-pay-gateway.test/v1/tokens/exchange');

    const request = requestInit as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Api-Key': 'google-pay-api-key',
      }),
    );
    expect(request.body).toBe(
      JSON.stringify({
        merchantIdentifier: 'merchant.com.lilocharge',
        paymentData: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      }),
    );
  });

  it('requires merchant identifier when calling remote token exchange endpoint', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    const client = new GooglePayClient({
      fetchFn: fetchMock,
      tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to deterministic local tokenization when exchange URL is not configured', async () => {
    const client = new GooglePayClient({
      merchantIdentifier: 'merchant.com.lilocharge',
    });

    const result = await client.exchangeToken({
      paymentToken: 'google-pay-payment-token',
      transactionIdentifier: 'google-pay-transaction-1',
    });

    expect(result.network).toBeNull();
    expect(result.paymentMethodToken).toMatch(/^googlepay_[a-f0-9]{64}$/);
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
    const client = new GooglePayClient({
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
      tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws service unavailable when remote token exchange transport fails', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('network timeout'));
    const client = new GooglePayClient({
      fetchFn: fetchMock,
      merchantIdentifier: 'merchant.com.lilocharge',
      tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
    });

    await expect(
      client.exchangeToken({
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
