import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { IdramClient } from './idram.client';

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

describe('IdramClient', () => {
  it('checks one wallet balance and forwards API credentials + request payload', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            balance: 12500,
            status: 'APPROVED',
          },
        }),
      );
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.getBalance({
        currency: 'AMD',
        walletToken: 'wallet-token-1',
      }),
    ).resolves.toEqual({
      balance: 12500,
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect(requestUrl).toBe('https://idram.test/v1/wallets/balance');

    const request = requestInit as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual(
      expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Api-Key': 'idram-api-key',
      }),
    );
    expect(request.body).toBe(
      JSON.stringify({
        currency: 'AMD',
        walletToken: 'wallet-token-1',
      }),
    );
  });

  it('forwards the idempotency key header on wallet debit when one is supplied', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'APPROVED',
            transactionId: 'idram-tx-1',
          },
        }),
      );
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await client.debitWallet({
      amount: 5000,
      currency: 'AMD',
      idempotencyKey: 'idempotency-key-1',
      orderId: 'order-1',
      walletToken: 'wallet-token-1',
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
            status: 'APPROVED',
            transactionId: 'idram-tx-1',
          },
        }),
      );
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await client.debitWallet({
      amount: 5000,
      currency: 'AMD',
      orderId: 'order-1',
      walletToken: 'wallet-token-1',
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [undefined, undefined];
    expect((requestInit as RequestInit).headers).not.toHaveProperty('Idempotency-Key');
  });

  it('throws internal server error when required credentials are missing', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    const client = new IdramClient({
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.getBalance({
        currency: 'AMD',
        walletToken: 'wallet-token-1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws bad gateway when Idram responds with a non-success HTTP status', async () => {
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
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.debitWallet({
        amount: 4200,
        currency: 'AMD',
        orderId: 'session-1',
        walletToken: 'wallet-token-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('throws bad request when Idram declines one operation', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'DECLINED',
            transactionId: 'idram-tx-1',
          },
        }),
      );
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.refund({
        amount: 4200,
        gatewayTransactionId: 'idram-tx-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws service unavailable when fetch transport fails', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('network timeout'));
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.debitWallet({
        amount: 4200,
        currency: 'AMD',
        orderId: 'session-1',
        walletToken: 'wallet-token-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws bad gateway when balance payload is missing numeric amount', async () => {
    const fetchMock = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        buildResponse({
          payload: {
            status: 'APPROVED',
          },
        }),
      );
    const client = new IdramClient({
      apiKey: 'idram-api-key',
      baseUrl: 'https://idram.test/v1',
      fetchFn: fetchMock,
    });

    await expect(
      client.getBalance({
        currency: 'AMD',
        walletToken: 'wallet-token-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
