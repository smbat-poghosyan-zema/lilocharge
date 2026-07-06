import type { WalletResponse, WalletTransactionResponse } from '@lilocharge/shared-types';

import { createWalletApi } from './wallet-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const WALLET_ID = '22222222-2222-2222-2222-222222222222';

function buildWalletResponse(overrides: Partial<WalletResponse> = {}): WalletResponse {
  return {
    balance: 500000,
    createdAt: '2026-07-01T10:00:00.000Z',
    id: WALLET_ID,
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    ...overrides,
  };
}

function buildTransactionResponse(
  overrides: Partial<WalletTransactionResponse> = {},
): WalletTransactionResponse {
  return {
    amount: 100000,
    balanceAfter: 600000,
    balanceBefore: 500000,
    createdAt: '2026-07-01T10:00:00.000Z',
    description: 'Wallet top-up',
    gateway: 'ARCA',
    gatewayTransactionId: 'gw-tx-1',
    id: '33333333-3333-3333-3333-333333333333',
    sessionId: null,
    type: 'TOP_UP',
    walletId: WALLET_ID,
    ...overrides,
  };
}

describe('wallet api', () => {
  it('fetches the wallet balance through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn(() => Promise.resolve(buildWalletResponse())),
    };

    const walletApi = createWalletApi(apiClientMock as never);

    await expect(walletApi.getWallet(USER_ID)).resolves.toMatchObject({
      balance: 500000,
      id: WALLET_ID,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/wallet`);
  });

  it('tops up the wallet through the typed API client', async () => {
    const apiClientMock = {
      post: jest.fn(() =>
        Promise.resolve({
          gatewayTransactionId: 'gw-tx-1',
          newBalance: 600000,
          transaction: buildTransactionResponse(),
        }),
      ),
    };

    const walletApi = createWalletApi(apiClientMock as never);

    await expect(
      walletApi.topUp(USER_ID, {
        amount: 100000,
        gateway: 'ARCA',
        paymentMethodId: '44444444-4444-4444-4444-444444444444',
      }),
    ).resolves.toMatchObject({
      newBalance: 600000,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${USER_ID}/wallet/top-up`, {
      body: {
        amount: 100000,
        gateway: 'ARCA',
        paymentMethodId: '44444444-4444-4444-4444-444444444444',
      },
    });
  });

  it('lists wallet transactions with pagination options', async () => {
    const apiClientMock = {
      get: jest.fn(() =>
        Promise.resolve({
          hasMore: true,
          nextCursor: 'cursor-2',
          transactions: [buildTransactionResponse()],
        }),
      ),
    };

    const walletApi = createWalletApi(apiClientMock as never);

    await expect(
      walletApi.listTransactions(USER_ID, { cursor: 'cursor-1', limit: 20, type: 'TOP_UP' }),
    ).resolves.toMatchObject({
      hasMore: true,
      nextCursor: 'cursor-2',
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/wallet/transactions`, {
      query: {
        cursor: 'cursor-1',
        limit: 20,
        type: 'TOP_UP',
      },
    });
  });

  it('lists wallet transactions without query options by default', async () => {
    const apiClientMock = {
      get: jest.fn(() =>
        Promise.resolve({
          hasMore: false,
          nextCursor: null,
          transactions: [],
        }),
      ),
    };

    const walletApi = createWalletApi(apiClientMock as never);

    await expect(walletApi.listTransactions(USER_ID)).resolves.toMatchObject({
      hasMore: false,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/wallet/transactions`, {
      query: {
        cursor: undefined,
        limit: undefined,
        type: undefined,
      },
    });
  });
});
