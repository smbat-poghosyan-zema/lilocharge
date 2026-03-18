/** Wallet transaction type for top-ups, deductions, and refunds. */
export type WalletTransactionType = 'TOP_UP' | 'DEDUCTION' | 'REFUND';

/** User wallet balance response returned by wallet endpoints. */
export interface WalletResponse {
  readonly balance: number;
  readonly createdAt: string;
  readonly id: string;
  readonly updatedAt: string;
  readonly userId: string;
}

/** Request payload for topping up wallet balance via ArCa or Idram. */
export interface WalletTopUpRequest {
  readonly amount: number;
  readonly gateway: 'ARCA' | 'IDRAM';
  readonly paymentMethodId?: string;
}

/** Response returned after successful wallet top-up. */
export interface WalletTopUpResponse {
  readonly gatewayTransactionId: string | null;
  readonly newBalance: number;
  readonly transaction: WalletTransactionResponse;
}

/** Individual wallet transaction record (top-up, deduction, refund). */
export interface WalletTransactionResponse {
  readonly amount: number;
  readonly balanceAfter: number;
  readonly balanceBefore: number;
  readonly createdAt: string;
  readonly description: string | null;
  readonly gateway: string | null;
  readonly gatewayTransactionId: string | null;
  readonly id: string;
  readonly sessionId: string | null;
  readonly type: WalletTransactionType;
  readonly walletId: string;
}

/** Paginated list of wallet transactions. */
export interface WalletTransactionsResponse {
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly transactions: WalletTransactionResponse[];
}
