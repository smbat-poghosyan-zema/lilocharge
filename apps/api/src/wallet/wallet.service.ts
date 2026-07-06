import { randomUUID } from 'node:crypto';

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

const TOP_UP_PAYMENT_METHOD_SELECT = {
  gateway: true,
  id: true,
  token: true,
} satisfies Prisma.PaymentMethodSelect;

type TopUpPaymentMethodRecord = Prisma.PaymentMethodGetPayload<{
  select: typeof TOP_UP_PAYMENT_METHOD_SELECT;
}>;

/** Payment-method gateways whose stored tokens are chargeable through the ArCa card API. */
const ARCA_ROUTED_GATEWAYS: readonly PaymentGateway[] = [
  PaymentGateway.ARCA,
  PaymentGateway.APPLE_PAY,
  PaymentGateway.GOOGLE_PAY,
];

/** Case-insensitive UUID shape guard applied before querying UUID-typed columns. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
   * Resolves the caller's stored payment method (never forwarding raw ids as gateway
   * tokens), charges the gateway with per-operation idempotency keys, and records the
   * wallet transaction atomically with the balance update.
   */
  public async topUp(input: TopUpWalletInput): Promise<WalletTopUpResponse> {
    if (input.amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than zero');
    }

    const paymentMethod = await this.resolveTopUpPaymentMethod(input);
    const wallet = await this.getOrCreateWallet(input.userId);
    const gateway = input.gateway === 'ARCA' ? PaymentGateway.ARCA : PaymentGateway.IDRAM;
    const orderId = `wallet-topup-${randomUUID()}`;
    // The key of the money-moving operation (ArCa capture / Idram debit) is persisted on
    // the wallet transaction so operational retries or reconciliation can reuse it.
    const idempotencyKey = randomUUID();

    let gatewayTransactionId: string | null = null;

    // Process payment via gateway
    if (gateway === PaymentGateway.ARCA) {
      // For ArCa, use preAuthorize followed by immediate capture
      const preAuthResult = await this.arcaClient.preAuthorize({
        amount: input.amount,
        cardToken: paymentMethod.token,
        currency: 'AMD',
        description: 'Wallet top-up',
        idempotencyKey: randomUUID(),
        orderId,
      });
      gatewayTransactionId = preAuthResult.gatewayTransactionId;

      // Immediately capture the pre-authorized amount
      await this.arcaClient.capture({
        amount: input.amount,
        gatewayTransactionId,
        idempotencyKey,
      });
    } else {
      // For Idram, use debitWallet for direct charge
      const debitResult = await this.idramClient.debitWallet({
        amount: input.amount,
        currency: 'AMD',
        description: 'Wallet top-up',
        idempotencyKey,
        orderId,
        walletToken: paymentMethod.token,
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
          idempotencyKey,
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
   * Resolves the stored payment method backing one wallet top-up.
   * Rejects missing ids, ids not owned by the caller (404), and methods whose gateway
   * cannot service the requested top-up gateway, so raw ids are never sent as tokens.
   */
  private async resolveTopUpPaymentMethod(
    input: TopUpWalletInput,
  ): Promise<TopUpPaymentMethodRecord> {
    const paymentMethodId = input.paymentMethodId?.trim();

    if (paymentMethodId === undefined || paymentMethodId.length === 0) {
      throw new BadRequestException('paymentMethodId is required for wallet top-up');
    }

    if (!UUID_PATTERN.test(paymentMethodId)) {
      throw new BadRequestException('paymentMethodId must be a valid UUID');
    }

    const paymentMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId: input.userId,
      },
      select: TOP_UP_PAYMENT_METHOD_SELECT,
    });

    if (paymentMethod === null) {
      throw new NotFoundException('Payment method not found for this user');
    }

    const isCompatible =
      input.gateway === 'ARCA'
        ? ARCA_ROUTED_GATEWAYS.includes(paymentMethod.gateway)
        : paymentMethod.gateway === PaymentGateway.IDRAM;

    if (!isCompatible) {
      throw new BadRequestException(
        `Payment method gateway ${paymentMethod.gateway} cannot be used for ${input.gateway} top-up`,
      );
    }

    return paymentMethod;
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
