import { randomUUID } from 'node:crypto';

import type {
  WalletResponse,
  WalletTopUpResponse,
  WalletTransactionResponse,
  WalletTransactionsResponse,
} from '@lilocharge/shared-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PaymentGateway, WalletTransactionStatus, WalletTransactionType } from '@prisma/client';

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
  private readonly logger: Logger = new Logger(WalletService.name);

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
   * tokens), persists a PENDING ledger row carrying every gateway idempotency key BEFORE
   * the first gateway call (so a crash between gateway capture and wallet credit leaves a
   * durable record that reconciliation can complete with the same keys instead of
   * double-charging), then credits the balance atomically and completes the row.
   */
  public async topUp(input: TopUpWalletInput): Promise<WalletTopUpResponse> {
    if (input.amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than zero');
    }

    const paymentMethod = await this.resolveTopUpPaymentMethod(input);
    const wallet = await this.getOrCreateWallet(input.userId);
    const gateway = input.gateway === 'ARCA' ? PaymentGateway.ARCA : PaymentGateway.IDRAM;
    // The key of the money-moving operation (ArCa capture / Idram debit). The pre-auth leg
    // and order id are derived from values persisted on the same PENDING row, so every key
    // sent to a gateway is durable before the gateway ever sees it.
    const idempotencyKey = randomUUID();

    const pendingTransaction = await this.prismaService.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.TOP_UP,
        status: WalletTransactionStatus.PENDING,
        amount: input.amount,
        balanceBefore: 0,
        balanceAfter: 0,
        gateway,
        idempotencyKey,
        description: `Wallet top-up via ${input.gateway}`,
      },
      select: { id: true },
    });
    const orderId = `wallet-topup-${pendingTransaction.id}`;

    let gatewayTransactionId: string | null = null;

    try {
      // Process payment via gateway
      if (gateway === PaymentGateway.ARCA) {
        // For ArCa, use preAuthorize followed by immediate capture
        const preAuthResult = await this.arcaClient.preAuthorize({
          amount: input.amount,
          cardToken: paymentMethod.token,
          currency: 'AMD',
          description: 'Wallet top-up',
          idempotencyKey: `${idempotencyKey}-preauth`,
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
    } catch (error: unknown) {
      await this.markTopUpTransactionFailed(pendingTransaction.id);
      throw error;
    }

    // Credit the wallet atomically: claim the PENDING row first (so the credit can never
    // be applied twice for the same gateway operation), then apply an atomic increment and
    // derive the ledger balances from the post-increment read inside the same transaction.
    const result = await this.prismaService.$transaction(async (tx) => {
      const claimed = await tx.walletTransaction.updateMany({
        where: { id: pendingTransaction.id, status: WalletTransactionStatus.PENDING },
        data: { status: WalletTransactionStatus.COMPLETED, gatewayTransactionId },
      });

      if (claimed.count === 0) {
        throw new ConflictException('Wallet top-up has already been finalized');
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: input.amount } },
        select: WALLET_RESPONSE_SELECT,
      });

      const transaction = await tx.walletTransaction.update({
        where: { id: pendingTransaction.id },
        data: {
          balanceBefore: updatedWallet.balance - input.amount,
          balanceAfter: updatedWallet.balance,
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
   * Best-effort transition of one PENDING top-up ledger row to FAILED after a gateway
   * error. Failures here are swallowed so the original gateway error propagates; the row
   * then stays PENDING with its persisted keys for reconciliation.
   */
  private async markTopUpTransactionFailed(transactionId: string): Promise<void> {
    try {
      await this.prismaService.walletTransaction.updateMany({
        where: { id: transactionId, status: WalletTransactionStatus.PENDING },
        data: { status: WalletTransactionStatus.FAILED },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to mark wallet top-up transaction ${transactionId} as FAILED: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
   *
   * The deduction is a race-safe conditional decrement: it only succeeds when the balance
   * still covers the amount at write time, so concurrent deductions can never lose an
   * update or drive the balance negative (a DB CHECK constraint backs this invariant up).
   * Ledger balances are derived from a post-decrement read inside the same transaction.
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
      const deducted = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: input.amount } },
        data: { balance: { decrement: input.amount } },
      });

      if (deducted.count === 0) {
        // A concurrent deduction won the race and the remaining balance no longer covers
        // this amount (or the wallet row disappeared).
        throw new BadRequestException('Insufficient wallet balance');
      }

      const currentWallet = await tx.wallet.findUnique({
        where: { id: wallet.id },
        select: { balance: true },
      });

      if (currentWallet === null) {
        throw new NotFoundException('Wallet not found');
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.DEDUCTION,
          status: WalletTransactionStatus.COMPLETED,
          amount: input.amount,
          balanceBefore: currentWallet.balance + input.amount,
          balanceAfter: currentWallet.balance,
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
   * Creates a REFUND transaction and increases wallet balance via an atomic increment,
   * deriving ledger balances from the post-increment result so concurrent writers can
   * never lose an update.
   */
  public async refundBalance(input: RefundWalletBalanceInput): Promise<WalletTransactionResponse> {
    if (input.amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }

    const wallet = await this.getOrCreateWallet(input.userId);

    const result = await this.prismaService.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: input.amount } },
        select: { balance: true },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.REFUND,
          status: WalletTransactionStatus.COMPLETED,
          amount: input.amount,
          balanceBefore: updatedWallet.balance - input.amount,
          balanceAfter: updatedWallet.balance,
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
      // PENDING/FAILED top-up rows are internal idempotency bookkeeping, not history.
      status: WalletTransactionStatus.COMPLETED,
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
