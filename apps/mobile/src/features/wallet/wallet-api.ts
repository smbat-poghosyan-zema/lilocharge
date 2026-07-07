import type {
  WalletResponse,
  WalletTopUpRequest,
  WalletTopUpResponse,
  WalletTransactionType,
  WalletTransactionsResponse,
} from '@lilocharge/shared-types';

import type { ApiClient } from '../../api';
import { createAuthenticatedApiClient } from '../onboarding/authenticated-api-client';

/** Query options accepted by the paginated wallet transactions endpoint. */
export interface WalletTransactionsQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly type?: WalletTransactionType;
}

/** Typed API contract for wallet balance, top-up, and ledger operations. */
export interface WalletApi {
  getWallet(userId: string): Promise<WalletResponse>;
  listTransactions(
    userId: string,
    query?: WalletTransactionsQuery,
  ): Promise<WalletTransactionsResponse>;
  topUp(userId: string, request: WalletTopUpRequest): Promise<WalletTopUpResponse>;
}

/** Creates wallet API helpers backed by the shared typed ApiClient. */
export function createWalletApi(apiClient: ApiClient): WalletApi {
  return {
    getWallet: (userId: string): Promise<WalletResponse> => {
      return apiClient.get<WalletResponse>(`/users/${userId}/wallet`);
    },
    listTransactions: (
      userId: string,
      query: WalletTransactionsQuery = {},
    ): Promise<WalletTransactionsResponse> => {
      return apiClient.get<WalletTransactionsResponse>(`/users/${userId}/wallet/transactions`, {
        query: {
          cursor: query.cursor,
          limit: query.limit,
          type: query.type,
        },
      });
    },
    topUp: (userId: string, request: WalletTopUpRequest): Promise<WalletTopUpResponse> => {
      return apiClient.post<WalletTopUpResponse, WalletTopUpRequest>(
        `/users/${userId}/wallet/top-up`,
        {
          body: request,
        },
      );
    },
  };
}

const defaultWalletApiClient = createAuthenticatedApiClient();

/** Default wallet API instance for balance and top-up operations. */
export const walletApi = createWalletApi(defaultWalletApiClient);
