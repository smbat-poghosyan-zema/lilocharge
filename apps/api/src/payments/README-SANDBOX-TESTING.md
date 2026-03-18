# Payment Gateway Sandbox Testing Guide

This document describes the comprehensive sandbox testing suite for all LiloCharge payment gateways.

## Overview

The sandbox testing suite (`payment-gateways.sandbox.spec.ts`) validates all four payment gateway integrations:

- **ArCa** (Armenian card payments)
- **Idram** (Armenian digital wallet)
- **Apple Pay** (iOS contactless payments)
- **Google Pay** (Android contactless payments)

## Test Coverage

### ArCa Sandbox Tests (6 scenarios)

1. **Successful Pre-Authorization** - Validates card pre-auth flow
2. **Successful Capture** - Validates capturing pre-authorized funds
3. **Successful Refund** - Validates refunding captured payments
4. **Declined Authorization** - Tests handling of declined cards
5. **Insufficient Funds** - Tests handling of insufficient balance
6. **Network Timeout** - Tests resilience to network failures

**Sandbox URL**: `https://sandbox.arca.am/api/v1`

**Test Cards**:

- Success: `sandbox-card-token-success`
- Decline: `sandbox-card-token-decline`
- Insufficient: `sandbox-card-token-insufficient`

### Idram Test Environment Tests (6 scenarios)

1. **Balance Check** - Validates wallet balance inquiry
2. **Successful Debit** - Validates debiting from wallet
3. **Successful Refund** - Validates refunding to wallet
4. **Insufficient Balance** - Tests low balance handling
5. **Invalid Token** - Tests invalid wallet token handling
6. **Network Timeout** - Tests resilience to network failures

**Test URL**: `https://test.wallet.idram.am/api/v1`

**Test Wallets**:

- Standard: `test-wallet-token-001`
- Low Balance: `test-wallet-token-low-balance`
- Invalid: `invalid-wallet-token`

### Apple Pay Sandbox Tests (6 scenarios)

1. **Visa Token Exchange** - Validates Visa card tokenization
2. **MasterCard Token Exchange** - Validates MasterCard tokenization
3. **Local Fallback** - Tests offline tokenization mode
4. **Deterministic Tokens** - Validates token consistency
5. **Invalid Token Format** - Tests error handling
6. **Network Timeout** - Tests resilience to network failures

**Sandbox Configuration**:

- Merchant ID: `merchant.com.lilocharge.sandbox`
- Exchange URL: `https://apple-pay-gateway.sandbox/v1/tokens/exchange`

### Google Pay Test Environment Tests (6 scenarios)

1. **Visa Token Exchange** - Validates Visa card tokenization
2. **MasterCard Token Exchange** - Validates MasterCard tokenization
3. **Local Fallback** - Tests offline tokenization mode
4. **Deterministic Tokens** - Validates token consistency
5. **Invalid Token Format** - Tests error handling
6. **Network Timeout** - Tests resilience to network failures

**Test Configuration**:

- Merchant ID: `lilocharge-test-merchant-id`
- Exchange URL: `https://google-pay-gateway.test/v1/tokens/exchange`

### Cross-Gateway Integration Tests (2 scenarios)

1. **Concurrent Operations** - Validates all gateways handle parallel requests
2. **Error Handling** - Validates consistent 5xx error handling across gateways

## Running Tests

### Run all sandbox tests:

```bash
pnpm test payment-gateways.sandbox.spec.ts
```

### Run specific gateway tests:

```bash
pnpm test payment-gateways.sandbox.spec.ts -t "ArCa Sandbox"
pnpm test payment-gateways.sandbox.spec.ts -t "Idram Sandbox"
pnpm test payment-gateways.sandbox.spec.ts -t "Apple Pay Sandbox"
pnpm test payment-gateways.sandbox.spec.ts -t "Google Pay Test"
```

### Run all payment tests:

```bash
pnpm test src/payments
```

## Environment Variables

### ArCa Sandbox

```bash
ARCA_API_KEY=sandbox-api-key
ARCA_MERCHANT_ID=sandbox-merchant-id
ARCA_BASE_URL=https://sandbox.arca.am/api/v1
```

### Idram Test

```bash
IDRAM_API_KEY=test-idram-api-key
IDRAM_BASE_URL=https://test.wallet.idram.am/api/v1
```

### Apple Pay Sandbox

```bash
APPLE_PAY_API_KEY=sandbox-apple-pay-api-key
APPLE_PAY_MERCHANT_IDENTIFIER=merchant.com.lilocharge.sandbox
APPLE_PAY_TOKEN_EXCHANGE_URL=https://apple-pay-gateway.sandbox/v1/tokens/exchange
```

### Google Pay Test

```bash
GOOGLE_PAY_API_KEY=test-google-pay-api-key
GOOGLE_PAY_MERCHANT_ID=lilocharge-test-merchant-id
GOOGLE_PAY_TOKEN_EXCHANGE_URL=https://google-pay-gateway.test/v1/tokens/exchange
```

## Test Scenarios

### Success Path

Each gateway validates the complete happy path:

1. Successful authentication
2. Successful operation execution
3. Proper response parsing
4. Transaction ID extraction

### Error Handling

Each gateway validates proper error handling:

1. Declined/rejected operations
2. Insufficient funds/balance
3. Invalid tokens/credentials
4. Network timeouts
5. HTTP 5xx errors

### Resilience

Tests validate:

1. Concurrent request handling
2. Graceful degradation
3. Consistent error responses
4. Timeout handling

## Test Structure

All tests follow the same pattern:

```typescript
describe('Gateway Name', () => {
  it('scenario description', async () => {
    // 1. Setup mock fetch with expected response
    const fetchMock = jest.fn().mockResolvedValue(buildResponse({...}));

    // 2. Create client with sandbox/test configuration
    const client = new GatewayClient({
      apiKey: 'test-key',
      baseUrl: 'https://sandbox.gateway.test',
      fetchFn: fetchMock,
    });

    // 3. Execute operation
    const result = await client.operation({...});

    // 4. Assert result
    expect(result).toEqual({...});

    // 5. Verify request details
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('...');
  });
});
```

## Production Readiness Checklist

Before deploying to production:

- [ ] All 26 sandbox tests pass
- [ ] All 75 payment tests pass
- [ ] TypeScript compilation succeeds with strict mode
- [ ] ESLint passes with zero warnings
- [ ] Environment variables configured for production gateways
- [ ] Real gateway credentials obtained and tested
- [ ] Error monitoring configured (Sentry)
- [ ] Payment transaction logging enabled
- [ ] PCI compliance requirements met
- [ ] Rate limiting configured for payment endpoints

## Security Notes

1. **Never commit sandbox credentials** to version control
2. **Rotate credentials regularly** (every 90 days minimum)
3. **Use separate credentials** for sandbox vs production
4. **Log all payment operations** with request IDs for auditing
5. **Monitor for suspicious patterns** (high decline rates, etc.)
6. **Implement rate limiting** on all payment endpoints
7. **Validate all input** before sending to gateways
8. **Never expose gateway errors** to end users

## Troubleshooting

### Tests failing with "Network timeout"

- Check internet connectivity
- Verify sandbox URLs are accessible
- Increase test timeout if needed

### Tests failing with "Missing credentials"

- Verify environment variables are set
- Check .env file in apps/api directory
- Ensure credentials are properly formatted

### Tests failing with "Invalid response"

- Check gateway API documentation for changes
- Verify response parsing logic in client
- Update mock responses to match current API

## Support

For payment gateway issues:

- **ArCa**: Contact ArCa merchant support
- **Idram**: Contact Idram developer support
- **Apple Pay**: Check Apple Pay developer documentation
- **Google Pay**: Check Google Pay developer documentation

For LiloCharge codebase issues:

- Check existing tests for examples
- Review client implementation comments
- Consult team documentation
