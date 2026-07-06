import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ArcaClient } from './arca.client';

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

describe('ArcaClient', () => {
  it('pre-authorizes one payment and forwards merchant credentials + request payload', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'AUTHORIZED',
            transactionId: 'arca-tx-1',
          },
        }),
      );
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await expect(
      client.preAuthorize({
        amount: 5000,
        cardToken: 'card-token-1',
        currency: 'AMD',
        description: 'LiloCharge session pre-auth',
        orderId: 'session-1',
      }),
    ).resolves.toEqual({
      gatewayTransactionId: 'arca-tx-1',
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect(requestUrl).toBe('https://arca.test/v1/payments/preauthorize');

    const request = requestInit as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Api-Key': 'arca-api-key',
        'X-Merchant-Id': 'arca-merchant-id',
      }),
    );
    expect(request.body).toBe(
      JSON.stringify({
        amount: 5000,
        cardToken: 'card-token-1',
        currency: 'AMD',
        description: 'LiloCharge session pre-auth',
        orderId: 'session-1',
      }),
    );
  });

  it('forwards the idempotency key header when one is supplied', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'CAPTURED',
            transactionId: 'arca-tx-2',
          },
        }),
      );
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await client.capture({
      amount: 5000,
      gatewayTransactionId: 'arca-tx-1',
      idempotencyKey: 'idempotency-key-1',
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect((requestInit as RequestInit).headers).toEqual(
      expect.objectContaining({
        'Idempotency-Key': 'idempotency-key-1',
      }),
    );
  });

  it('omits the idempotency key header when none is supplied', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'CAPTURED',
            transactionId: 'arca-tx-2',
          },
        }),
      );
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await client.capture({
      amount: 5000,
      gatewayTransactionId: 'arca-tx-1',
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect((requestInit as RequestInit).headers).not.toHaveProperty('Idempotency-Key');
  });

  it('throws internal server error when required credentials are missing', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    const client = new ArcaClient({
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.preAuthorize({
        amount: 2500,
        cardToken: 'card-token-1',
        currency: 'AMD',
        orderId: 'session-1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws bad gateway when ArCa responds with a non-success HTTP status', async () => {
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
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await expect(
      client.capture({
        amount: 4200,
        gatewayTransactionId: 'arca-tx-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws bad request when ArCa declines one operation', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'DECLINED',
            transactionId: 'arca-tx-1',
          },
        }),
      );
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await expect(
      client.refund({
        amount: 4200,
        gatewayTransactionId: 'arca-tx-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws service unavailable when fetch transport fails', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('network timeout'));
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await expect(
      client.capture({
        amount: 4200,
        gatewayTransactionId: 'arca-tx-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws bad gateway when response payload misses required transaction id', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'APPROVED',
          },
        }),
      );
    const client = new ArcaClient({
      apiKey: 'arca-api-key',
      baseUrl: 'https://arca.test/v1',
      fetchFn: fetchMock,
      merchantId: 'arca-merchant-id',
    });

    await expect(
      client.capture({
        amount: 4200,
        gatewayTransactionId: 'arca-tx-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
