import type {
  WalletResponse,
  WalletTopUpResponse,
  WalletTransactionResponse,
  WalletTransactionsResponse,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PaymentGateway, WalletTransactionType } from '@prisma/client';

import { ArcaClient } from '../payments/arca.client';
import { IdramClient } from '../payments/idram.client';
import { PrismaService } from '../prisma/prisma.service';

const WALLET_RESPONSE_SELECT = {
  balance: true,
  createdAt: true,
  id: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.WalletSelect;

const WALLET_TRANSACTION_RESPONSE_SELECT = {
  amount: true,
  balanceAfter: true,
  balanceBefore: true,
  createdAt: true,
  description: true,
  gateway: true,
  gatewayTransactionId: true,
  id: true,
  sessionId: true,
  type: true,
  walletId: true,
} satisfies Prisma.WalletTransactionSelect;

type WalletResponseRecord = Prisma.WalletGetPayload<{
  select: typeof WALLET_RESPONSE_SELECT;
}>;

type WalletTransactionResponseRecord = Prisma.WalletTransactionGetPayload<{
  select: typeof WALLET_TRANSACTION_RESPONSE_SELECT;
}>;

/** Input for topping up wallet via ArCa or Idram. */
export interface TopUpWalletInput {
  readonly amount: number;
  readonly gateway: 'ARCA' | 'IDRAM';
  readonly paymentMethodId?: string;
  readonly userId: string;
}

/** Input for deducting balance from wallet for session payment. */
export interface DeductWalletBalanceInput {
  readonly amount: number;
  readonly sessionId: string;
  readonly userId: string;
}

/** Input for refunding balance back to wallet. */
export interface RefundWalletBalanceInput {
  readonly amount: number;
  readonly sessionId: string;
  readonly userId: string;
}

/**
 * Service managing user wallet balances, top-ups via ArCa/Idram, and deductions for charging sessions.
 * Ensures atomic balance updates with transaction history tracking.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly arcaClient: ArcaClient,
    private readonly idramClient: IdramClient,
  ) {}

  /**
   * Retrieves or creates a wallet for the specified user.
   * Wallets are created on-demand with zero balance.
   */
  public async getOrCreateWallet(userId: string): Promise<WalletResponse> {
    const existing = await this.prismaService.wallet.findUnique({
      where: { userId },
      select: WALLET_RESPONSE_SELECT,
    });

    if (existing !== null) {
      return mapWalletRecordToResponse(existing);
    }

    const created = await this.prismaService.wallet.create({
      data: {
        userId,
        balance: 0,
      },
      select: WALLET_RESPONSE_SELECT,
    });

    return mapWalletRecordToResponse(created);
  }

  /**
   * Tops up wallet balance via ArCa or Idram payment gateway.
   * Creates a payment transaction, captures funds, and records wallet transaction.
   */
  public async topUp(input: TopUpWalletInput): Promise<WalletTopUpResponse> {
    if (input.amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(input.userId);
    const gateway = input.gateway === 'ARCA' ? PaymentGateway.ARCA : PaymentGateway.IDRAM;

    let gatewayTransactionId: string | null = null;

    // Process payment via gateway
    if (gateway === PaymentGateway.ARCA) {
      // For ArCa, use preAuthorize followed by immediate capture
      const preAuthResult = await this.arcaClient.preAuthorize({
        amount: input.amount,
        cardToken: input.paymentMethodId ?? '',
        currency: 'AMD',
        description: 'Wallet top-up',
        orderId: `wallet-topup-${wallet.id}-${Date.now()}`,
      });
      gatewayTransactionId = preAuthResult.gatewayTransactionId;

      // Immediately capture the pre-authorized amount
      await this.arcaClient.capture({
        amount: input.amount,
        gatewayTransactionId,
      });
    } else {
      // For Idram, use debitWallet for direct charge
      const debitResult = await this.idramClient.debitWallet({
        amount: input.amount,
        currency: 'AMD',
        description: 'Wallet top-up',
        orderId: `wallet-topup-${wallet.id}-${Date.now()}`,
        walletToken: input.paymentMethodId ?? '',
      });
      gatewayTransactionId = debitResult.gatewayTransactionId;
    }

    // Update wallet balance atomically with transaction record
    const result = await this.prismaService.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { balance: true },
      });

      if (currentWallet === null) {
        throw new NotFoundException('Wallet not found');
      }

      const newBalance = currentWallet.balance + input.amount;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
        select: WALLET_RESPONSE_SELECT,
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.TOP_UP,
          amount: input.amount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          gateway,
          gatewayTransactionId,
          description: `Wallet top-up via ${input.gateway}`,
        },
        select: WALLET_TRANSACTION_RESPONSE_SELECT,
      });

      return { wallet: updatedWallet, transaction };
    });

    return {
      gatewayTransactionId,
      newBalance: result.wallet.balance,
      transaction: mapWalletTransactionRecordToResponse(result.transaction),
    };
  }

  /**
   * Deducts balance from wallet for charging session payment.
   * Validates sufficient balance before deduction.
   */
  public async deductBalance(input: DeductWalletBalanceInput): Promise<WalletTransactionResponse> {
    if (input.amount <= 0) {
      throw new BadRequestException('Deduction amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(input.userId);

    if (wallet.balance < input.amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const result = await this.prismaService.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { balance: true },
      });

      if (currentWallet === null) {
        throw new NotFoundException('Wallet not found');
      }

      if (currentWallet.balance < input.amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const newBalance = currentWallet.balance - input.amount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.DEDUCTION,
          amount: input.amount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          sessionId: input.sessionId,
          description: `Payment for charging session`,
        },
        select: WALLET_TRANSACTION_RESPONSE_SELECT,
      });

      return transaction;
    });

    return mapWalletTransactionRecordToResponse(result);
  }

  /**
   * Refunds balance back to wallet (e.g., partial refund for cancelled session).
   * Creates a REFUND transaction and increases wallet balance.
   */
  public async refundBalance(input: RefundWalletBalanceInput): Promise<WalletTransactionResponse> {
    if (input.amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(input.userId);

    const result = await this.prismaService.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { balance: true },
      });

      if (currentWallet === null) {
        throw new NotFoundException('Wallet not found');
      }

      const newBalance = currentWallet.balance + input.amount;

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.REFUND,
          amount: input.amount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          sessionId: input.sessionId,
          description: `Refund for session ${input.sessionId}`,
        },
        select: WALLET_TRANSACTION_RESPONSE_SELECT,
      });

      return transaction;
    });

    return mapWalletTransactionRecordToResponse(result);
  }

  /**
   * Fetches paginated transaction history for a user's wallet.
   * Supports filtering by transaction type and cursor-based pagination.
   */
  public async getTransactions(
    userId: string,
    options?: {
      type?: WalletTransactionType;
      limit?: number;
      cursor?: string;
    },
  ): Promise<WalletTransactionsResponse> {
    const wallet = await this.getOrCreateWallet(userId);
    const limit = options?.limit ?? 20;

    const where: Prisma.WalletTransactionWhereInput = {
      walletId: wallet.id,
      ...(options?.type && { type: options.type }),
    };

    const transactions = await this.prismaService.walletTransaction.findMany({
      where,
      select: WALLET_TRANSACTION_RESPONSE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options?.cursor && {
        cursor: { id: options.cursor },
        skip: 1,
      }),
    });

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return {
      transactions: items.map(mapWalletTransactionRecordToResponse),
      hasMore,
      nextCursor,
    };
  }

  /**
   * Checks if user's wallet has sufficient balance for a transaction.
   * Returns true if balance >= required amount, false otherwise.
   */
  public async checkSufficientBalance(userId: string, requiredAmount: number): Promise<boolean> {
    if (requiredAmount <= 0) {
      return true;
    }

    const wallet = await this.prismaService.wallet.findUnique({
      where: { userId },
      select: { balance: true },
    });

    if (wallet === null) {
      return false;
    }

    return wallet.balance >= requiredAmount;
  }
}

/**
 * Maps a Prisma Wallet record to the API WalletResponse shape.
 */
function mapWalletRecordToResponse(record: WalletResponseRecord): WalletResponse {
  return {
    balance: record.balance,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    updatedAt: record.updatedAt.toISOString(),
    userId: record.userId,
  };
}

/**
 * Maps a Prisma WalletTransaction record to the API WalletTransactionResponse shape.
 */
function mapWalletTransactionRecordToResponse(
  record: WalletTransactionResponseRecord,
): WalletTransactionResponse {
  return {
    amount: record.amount,
    balanceAfter: record.balanceAfter,
    balanceBefore: record.balanceBefore,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    gateway: record.gateway,
    gatewayTransactionId: record.gatewayTransactionId,
    id: record.id,
    sessionId: record.sessionId,
    type: record.type as 'TOP_UP' | 'DEDUCTION' | 'REFUND',
    walletId: record.walletId,
  };
}
