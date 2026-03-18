import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ApplePayClient } from './apple-pay.client';
import { ArcaClient } from './arca.client';
import { GooglePayClient } from './google-pay.client';
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

/**
 * Sandbox integration tests validating all payment gateway clients against
 * simulated sandbox responses following production-like scenarios.
 */
describe('Payment Gateways Sandbox Testing Suite', () => {
  describe('ArCa Sandbox', () => {
    it('successfully pre-authorizes a payment in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'AUTHORIZED',
              transactionId: 'arca-sandbox-preauth-123',
            },
          }),
        );

      const client = new ArcaClient({
        apiKey: 'sandbox-api-key',
        baseUrl: 'https://sandbox.arca.am/api/v1',
        fetchFn: fetchMock,
        merchantId: 'sandbox-merchant-id',
      });

      const result = await client.preAuthorize({
        amount: 10000,
        cardToken: 'sandbox-card-token-success',
        currency: 'AMD',
        description: 'Sandbox pre-authorization test',
        orderId: 'sandbox-order-001',
      });

      expect(result.gatewayTransactionId).toBe('arca-sandbox-preauth-123');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] ?? [undefined, undefined];
      expect(url).toBe('https://sandbox.arca.am/api/v1/payments/preauthorize');
      expect((init as RequestInit).method).toBe('POST');
    });

    it('successfully captures a pre-authorized payment in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'CAPTURED',
              transactionId: 'arca-sandbox-capture-456',
            },
          }),
        );

      const client = new ArcaClient({
        apiKey: 'sandbox-api-key',
        baseUrl: 'https://sandbox.arca.am/api/v1',
        fetchFn: fetchMock,
        merchantId: 'sandbox-merchant-id',
      });

      const result = await client.capture({
        amount: 10000,
        gatewayTransactionId: 'arca-sandbox-preauth-123',
      });

      expect(result.gatewayTransactionId).toBe('arca-sandbox-capture-456');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('successfully refunds a captured payment in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'REFUNDED',
              transactionId: 'arca-sandbox-refund-789',
            },
          }),
        );

      const client = new ArcaClient({
        apiKey: 'sandbox-api-key',
        baseUrl: 'https://sandbox.arca.am/api/v1',
        fetchFn: fetchMock,
        merchantId: 'sandbox-merchant-id',
      });

      const result = await client.refund({
        amount: 10000,
        gatewayTransactionId: 'arca-sandbox-capture-456',
      });

      expect(result.gatewayTransactionId).toBe('arca-sandbox-refund-789');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('handles declined pre-authorization in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'DECLINED',
              transactionId: 'arca-sandbox-declined-001',
            },
          }),
        );

      const client = new ArcaClient({
        apiKey: 'sandbox-api-key',
        baseUrl: 'https://sandbox.arca.am/api/v1',
        fetchFn: fetchMock,
        merchantId: 'sandbox-merchant-id',
      });

      await expect(
        client.preAuthorize({
          amount: 10000,
          cardToken: 'sandbox-card-token-decline',
          currency: 'AMD',
          orderId: 'sandbox-order-002',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles insufficient funds scenario in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'INSUFFICIENT_FUNDS',
              transactionId: 'arca-sandbox-insufficient-001',
            },
          }),
        );

      const client = new ArcaClient({
        apiKey: 'sandbox-api-key',
        baseUrl: 'https://sandbox.arca.am/api/v1',
        fetchFn: fetchMock,
        merchantId: 'sandbox-merchant-id',
      });

      await expect(
        client.preAuthorize({
          amount: 999999999,
          cardToken: 'sandbox-card-token-insufficient',
          currency: 'AMD',
          orderId: 'sandbox-order-003',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles network timeout in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockRejectedValue(new Error('Network timeout'));

      const client = new ArcaClient({
        apiKey: 'sandbox-api-key',
        baseUrl: 'https://sandbox.arca.am/api/v1',
        fetchFn: fetchMock,
        merchantId: 'sandbox-merchant-id',
      });

      await expect(
        client.preAuthorize({
          amount: 10000,
          cardToken: 'sandbox-card-token-success',
          currency: 'AMD',
          orderId: 'sandbox-order-004',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Idram Sandbox', () => {
    it('successfully checks wallet balance in test environment', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              balance: 50000,
              status: 'SUCCESS',
            },
          }),
        );

      const client = new IdramClient({
        apiKey: 'test-idram-api-key',
        baseUrl: 'https://test.wallet.idram.am/api/v1',
        fetchFn: fetchMock,
      });

      const result = await client.getBalance({
        currency: 'AMD',
        walletToken: 'test-wallet-token-001',
      });

      expect(result.balance).toBe(50000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] ?? [undefined, undefined];
      expect(url).toBe('https://test.wallet.idram.am/api/v1/wallets/balance');
      expect((init as RequestInit).method).toBe('POST');
    });

    it('successfully debits wallet in test environment', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'SUCCESS',
              transactionId: 'idram-test-debit-001',
            },
          }),
        );

      const client = new IdramClient({
        apiKey: 'test-idram-api-key',
        baseUrl: 'https://test.wallet.idram.am/api/v1',
        fetchFn: fetchMock,
      });

      const result = await client.debitWallet({
        amount: 15000,
        currency: 'AMD',
        description: 'Test wallet debit',
        orderId: 'test-order-001',
        walletToken: 'test-wallet-token-001',
      });

      expect(result.gatewayTransactionId).toBe('idram-test-debit-001');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('successfully refunds wallet transaction in test environment', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'SUCCESS',
              transactionId: 'idram-test-refund-001',
            },
          }),
        );

      const client = new IdramClient({
        apiKey: 'test-idram-api-key',
        baseUrl: 'https://test.wallet.idram.am/api/v1',
        fetchFn: fetchMock,
      });

      const result = await client.refund({
        amount: 15000,
        gatewayTransactionId: 'idram-test-debit-001',
      });

      expect(result.gatewayTransactionId).toBe('idram-test-refund-001');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('handles insufficient balance scenario in test environment', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              status: 'INSUFFICIENT_BALANCE',
              transactionId: 'idram-test-insufficient-001',
            },
          }),
        );

      const client = new IdramClient({
        apiKey: 'test-idram-api-key',
        baseUrl: 'https://test.wallet.idram.am/api/v1',
        fetchFn: fetchMock,
      });

      await expect(
        client.debitWallet({
          amount: 999999999,
          currency: 'AMD',
          orderId: 'test-order-002',
          walletToken: 'test-wallet-token-low-balance',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles invalid wallet token in test environment', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              balance: 0,
              status: 'INVALID_TOKEN',
            },
          }),
        );

      const client = new IdramClient({
        apiKey: 'test-idram-api-key',
        baseUrl: 'https://test.wallet.idram.am/api/v1',
        fetchFn: fetchMock,
      });

      await expect(
        client.getBalance({
          currency: 'AMD',
          walletToken: 'invalid-wallet-token',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles network timeout in test environment', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockRejectedValue(new Error('Network timeout'));

      const client = new IdramClient({
        apiKey: 'test-idram-api-key',
        baseUrl: 'https://test.wallet.idram.am/api/v1',
        fetchFn: fetchMock,
      });

      await expect(
        client.getBalance({
          currency: 'AMD',
          walletToken: 'test-wallet-token-001',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Apple Pay Sandbox', () => {
    it('successfully exchanges payment token in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              network: 'visa',
              token: 'applepay-sandbox-token-001',
            },
          }),
        );

      const client = new ApplePayClient({
        apiKey: 'sandbox-apple-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'merchant.com.lilocharge.sandbox',
        tokenExchangeUrl: 'https://apple-pay-gateway.sandbox/v1/tokens/exchange',
      });

      const result = await client.exchangeToken({
        paymentToken: 'sandbox-apple-pay-token',
        transactionIdentifier: 'sandbox-apple-txn-001',
      });

      expect(result.paymentMethodToken).toBe('applepay-sandbox-token-001');
      expect(result.network).toBe('visa');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url] = fetchMock.mock.calls[0] ?? [undefined];
      expect(url).toBe('https://apple-pay-gateway.sandbox/v1/tokens/exchange');
    });

    it('successfully exchanges MasterCard token in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              network: 'mastercard',
              token: 'applepay-sandbox-token-002',
            },
          }),
        );

      const client = new ApplePayClient({
        apiKey: 'sandbox-apple-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'merchant.com.lilocharge.sandbox',
        tokenExchangeUrl: 'https://apple-pay-gateway.sandbox/v1/tokens/exchange',
      });

      const result = await client.exchangeToken({
        paymentToken: 'sandbox-apple-pay-token-mc',
        transactionIdentifier: 'sandbox-apple-txn-002',
      });

      expect(result.paymentMethodToken).toBe('applepay-sandbox-token-002');
      expect(result.network).toBe('mastercard');
    });

    it('falls back to local tokenization when sandbox URL not configured', async () => {
      const client = new ApplePayClient({
        merchantIdentifier: 'merchant.com.lilocharge.sandbox',
      });

      const result = await client.exchangeToken({
        paymentToken: 'sandbox-apple-pay-token',
        transactionIdentifier: 'sandbox-apple-txn-003',
      });

      expect(result.network).toBeNull();
      expect(result.paymentMethodToken).toMatch(/^applepay_[a-f0-9]{64}$/);
    });

    it('produces consistent local tokens for same input in sandbox mode', async () => {
      const client = new ApplePayClient({
        merchantIdentifier: 'merchant.com.lilocharge.sandbox',
      });

      const result1 = await client.exchangeToken({
        paymentToken: 'test-token',
        transactionIdentifier: 'test-txn',
      });

      const result2 = await client.exchangeToken({
        paymentToken: 'test-token',
        transactionIdentifier: 'test-txn',
      });

      expect(result1.paymentMethodToken).toBe(result2.paymentMethodToken);
    });

    it('handles invalid token format in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              error: 'Invalid payment token',
            },
          }),
        );

      const client = new ApplePayClient({
        apiKey: 'sandbox-apple-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'merchant.com.lilocharge.sandbox',
        tokenExchangeUrl: 'https://apple-pay-gateway.sandbox/v1/tokens/exchange',
      });

      await expect(
        client.exchangeToken({
          paymentToken: 'invalid-token-format',
          transactionIdentifier: 'sandbox-apple-txn-004',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('handles network timeout in sandbox mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockRejectedValue(new Error('Network timeout'));

      const client = new ApplePayClient({
        apiKey: 'sandbox-apple-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'merchant.com.lilocharge.sandbox',
        tokenExchangeUrl: 'https://apple-pay-gateway.sandbox/v1/tokens/exchange',
      });

      await expect(
        client.exchangeToken({
          paymentToken: 'sandbox-apple-pay-token',
          transactionIdentifier: 'sandbox-apple-txn-005',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Google Pay Test', () => {
    it('successfully exchanges payment token in test mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              network: 'visa',
              token: 'googlepay-test-token-001',
            },
          }),
        );

      const client = new GooglePayClient({
        apiKey: 'test-google-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'lilocharge-test-merchant-id',
        tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
      });

      const result = await client.exchangeToken({
        paymentToken: 'test-google-pay-token',
        transactionIdentifier: 'test-google-txn-001',
      });

      expect(result.paymentMethodToken).toBe('googlepay-test-token-001');
      expect(result.network).toBe('visa');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url] = fetchMock.mock.calls[0] ?? [undefined];
      expect(url).toBe('https://google-pay-gateway.test/v1/tokens/exchange');
    });

    it('successfully exchanges MasterCard token in test mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              network: 'mastercard',
              token: 'googlepay-test-token-002',
            },
          }),
        );

      const client = new GooglePayClient({
        apiKey: 'test-google-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'lilocharge-test-merchant-id',
        tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
      });

      const result = await client.exchangeToken({
        paymentToken: 'test-google-pay-token-mc',
        transactionIdentifier: 'test-google-txn-002',
      });

      expect(result.paymentMethodToken).toBe('googlepay-test-token-002');
      expect(result.network).toBe('mastercard');
    });

    it('falls back to local tokenization when test URL not configured', async () => {
      const client = new GooglePayClient({
        merchantIdentifier: 'lilocharge-test-merchant-id',
      });

      const result = await client.exchangeToken({
        paymentToken: 'test-google-pay-token',
        transactionIdentifier: 'test-google-txn-003',
      });

      expect(result.network).toBeNull();
      expect(result.paymentMethodToken).toMatch(/^googlepay_[a-f0-9]{64}$/);
    });

    it('produces consistent local tokens for same input in test mode', async () => {
      const client = new GooglePayClient({
        merchantIdentifier: 'lilocharge-test-merchant-id',
      });

      const result1 = await client.exchangeToken({
        paymentToken: 'test-token',
        transactionIdentifier: 'test-txn',
      });

      const result2 = await client.exchangeToken({
        paymentToken: 'test-token',
        transactionIdentifier: 'test-txn',
      });

      expect(result1.paymentMethodToken).toBe(result2.paymentMethodToken);
    });

    it('handles invalid token format in test mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: {
              error: 'Invalid payment token',
            },
          }),
        );

      const client = new GooglePayClient({
        apiKey: 'test-google-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'lilocharge-test-merchant-id',
        tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
      });

      await expect(
        client.exchangeToken({
          paymentToken: 'invalid-token-format',
          transactionIdentifier: 'test-google-txn-004',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('handles network timeout in test mode', async () => {
      const fetchMock = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockRejectedValue(new Error('Network timeout'));

      const client = new GooglePayClient({
        apiKey: 'test-google-pay-api-key',
        fetchFn: fetchMock,
        merchantIdentifier: 'lilocharge-test-merchant-id',
        tokenExchangeUrl: 'https://google-pay-gateway.test/v1/tokens/exchange',
      });

      await expect(
        client.exchangeToken({
          paymentToken: 'test-google-pay-token',
          transactionIdentifier: 'test-google-txn-005',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Cross-Gateway Integration Tests', () => {
    it('all gateways handle concurrent sandbox requests correctly', async () => {
      const arcaFetch = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: { status: 'AUTHORIZED', transactionId: 'arca-concurrent-001' },
          }),
        );

      const idramFetch = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: { status: 'SUCCESS', transactionId: 'idram-concurrent-001' },
          }),
        );

      const applePayFetch = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: { network: 'visa', token: 'applepay-concurrent-001' },
          }),
        );

      const googlePayFetch = jest
        .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
        .mockResolvedValue(
          buildResponse({
            payload: { network: 'visa', token: 'googlepay-concurrent-001' },
          }),
        );

      const arcaClient = new ArcaClient({
        apiKey: 'test-key',
        fetchFn: arcaFetch,
        merchantId: 'test-merchant',
      });

      const idramClient = new IdramClient({
        apiKey: 'test-key',
        fetchFn: idramFetch,
      });

      const applePayClient = new ApplePayClient({
        apiKey: 'test-key',
        fetchFn: applePayFetch,
        merchantIdentifier: 'test-merchant',
        tokenExchangeUrl: 'https://test/exchange',
      });

      const googlePayClient = new GooglePayClient({
        apiKey: 'test-key',
        fetchFn: googlePayFetch,
        merchantIdentifier: 'test-merchant',
        tokenExchangeUrl: 'https://test/exchange',
      });

      const [arcaResult, idramResult, applePayResult, googlePayResult] = await Promise.all([
        arcaClient.preAuthorize({
          amount: 1000,
          cardToken: 'test',
          currency: 'AMD',
          orderId: 'test-001',
        }),
        idramClient.debitWallet({
          amount: 1000,
          currency: 'AMD',
          orderId: 'test-001',
          walletToken: 'test',
        }),
        applePayClient.exchangeToken({
          paymentToken: 'test',
          transactionIdentifier: 'test-001',
        }),
        googlePayClient.exchangeToken({
          paymentToken: 'test',
          transactionIdentifier: 'test-001',
        }),
      ]);

      expect(arcaResult.gatewayTransactionId).toBe('arca-concurrent-001');
      expect(idramResult.gatewayTransactionId).toBe('idram-concurrent-001');
      expect(applePayResult.paymentMethodToken).toBe('applepay-concurrent-001');
      expect(googlePayResult.paymentMethodToken).toBe('googlepay-concurrent-001');
    });

    it('all gateways properly handle 5xx errors in sandbox mode', async () => {
      const build5xxResponse = () =>
        buildResponse({
          payload: { error: 'Internal server error' },
          status: 502,
        });

      const arcaClient = new ArcaClient({
        apiKey: 'test-key',
        fetchFn: jest.fn().mockResolvedValue(build5xxResponse()),
        merchantId: 'test-merchant',
      });

      const idramClient = new IdramClient({
        apiKey: 'test-key',
        fetchFn: jest.fn().mockResolvedValue(build5xxResponse()),
      });

      const applePayClient = new ApplePayClient({
        apiKey: 'test-key',
        fetchFn: jest.fn().mockResolvedValue(build5xxResponse()),
        merchantIdentifier: 'test-merchant',
        tokenExchangeUrl: 'https://test/exchange',
      });

      const googlePayClient = new GooglePayClient({
        apiKey: 'test-key',
        fetchFn: jest.fn().mockResolvedValue(build5xxResponse()),
        merchantIdentifier: 'test-merchant',
        tokenExchangeUrl: 'https://test/exchange',
      });

      await expect(
        arcaClient.preAuthorize({
          amount: 1000,
          cardToken: 'test',
          currency: 'AMD',
          orderId: 'test',
        }),
      ).rejects.toThrow(BadGatewayException);

      await expect(
        idramClient.getBalance({ currency: 'AMD', walletToken: 'test' }),
      ).rejects.toThrow(BadGatewayException);

      await expect(
        applePayClient.exchangeToken({ paymentToken: 'test', transactionIdentifier: 'test' }),
      ).rejects.toThrow(BadGatewayException);

      await expect(
        googlePayClient.exchangeToken({ paymentToken: 'test', transactionIdentifier: 'test' }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
