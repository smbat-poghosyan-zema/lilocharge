import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PaymentGateway, PaymentStatus } from '@prisma/client';

import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Settlement route decided for one completing session.
 *
 * The decision is computed BEFORE the session row is finalized (it determines the persisted
 * totalCost) and executed AFTER the row is COMPLETED, so the API stop path and the OCPP
 * charger-stop path bill identically:
 * - zero-energy sessions bill 0 and release (refund) any gateway pre-authorization;
 * - wallet-default users pay from their wallet balance with a wallet payment record;
 * - everyone else has the gateway pre-authorization captured.
 */
export interface SessionSettlementDecision {
  readonly isZeroEnergy: boolean;
  readonly totalCost: number;
  readonly usesWallet: boolean;
}

/** Input used to decide the settlement route for one completing session. */
export interface ResolveSettlementInput {
  /** Billable energy figure for the session (meter data or persisted fallback), in kWh. */
  readonly billableEnergyKwh: number;
  /** Tariff cost computed for the session, in integer AMD. */
  readonly computedTotalCost: number;
  readonly userId: string;
}

/** Input used to execute one previously decided settlement. */
export interface SettleCompletedSessionInput {
  readonly decision: SessionSettlementDecision;
  readonly sessionId: string;
  readonly userId: string;
}

/**
 * Single settlement authority shared by every session stop path (API stop, OCPP 1.6
 * StopTransaction, OCPP 2.0.1 TransactionEvent Ended).
 *
 * This service exists because the API stop path and the charger-initiated stop path historically
 * diverged (charger stops captured a gateway pre-auth that wallet users never had, and billed
 * time/session fees on zero-energy sessions). Any new stop/finalization path must route its
 * billing through this service instead of re-implementing the rules.
 */
@Injectable()
export class SessionSettlementService {
  private readonly logger: Logger = new Logger(SessionSettlementService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly walletService: WalletService,
  ) {}

  /** Checks whether one user's default payment method is the internal wallet. */
  public async hasWalletAsDefaultPaymentMethod(userId: string): Promise<boolean> {
    const defaultWalletMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        userId,
        gateway: PaymentGateway.WALLET,
        isDefault: true,
      },
      select: {
        id: true,
      },
    });

    return defaultWalletMethod !== null;
  }

  /** Decides the persisted total and settlement route for one completing session. */
  public async resolveSettlement(input: ResolveSettlementInput): Promise<SessionSettlementDecision> {
    // Zero-energy sessions (charger fault, cable never engaged, EV rejected charge) must not be
    // billed: the total is forced to zero and any gateway pre-authorization is released.
    if (input.billableEnergyKwh <= 0) {
      return {
        isZeroEnergy: true,
        totalCost: 0,
        usesWallet: false,
      };
    }

    return {
      isZeroEnergy: false,
      totalCost: input.computedTotalCost,
      usesWallet: await this.hasWalletAsDefaultPaymentMethod(input.userId),
    };
  }

  /**
   * Executes one settlement decision after the session row was persisted as COMPLETED.
   *
   * Callers own their failure semantics: the API stop path propagates errors to the client,
   * while OCPP handlers must catch and log because a charger cannot receive an HTTP error.
   */
  public async settleCompletedSession(input: SettleCompletedSessionInput): Promise<void> {
    if (input.decision.isZeroEnergy) {
      // Auto-refund: release the pre-authorized amount instead of capturing anything.
      // Wallet-funded sessions have no payment record before capture, so this is a safe no-op.
      this.logger.warn(
        `Session ${input.sessionId} completed with zero energy delivered; refunding pre-authorization`,
      );
      await this.paymentsService.refundPaymentForSessionFailure(input.sessionId);

      return;
    }

    if (input.decision.usesWallet) {
      if (input.decision.totalCost <= 0) {
        // Non-zero energy with a zero total only happens after a pricing failure; there is
        // nothing to deduct, but the anomaly must stay visible.
        this.logger.warn(
          `Session ${input.sessionId} settled at zero cost despite delivered energy; skipping wallet deduction`,
        );

        return;
      }

      await this.walletService.deductBalance({
        amount: input.decision.totalCost,
        sessionId: input.sessionId,
        userId: input.userId,
      });
      await this.createWalletPaymentRecord({
        amount: input.decision.totalCost,
        sessionId: input.sessionId,
        userId: input.userId,
      });

      return;
    }

    await this.paymentsService.captureAuthorizedPaymentForSession({
      amount: input.decision.totalCost,
      sessionId: input.sessionId,
    });
  }

  /**
   * Creates a Payment record for wallet-based session payments.
   * Wallet payments are immediately captured (no pre-auth/capture flow).
   */
  private async createWalletPaymentRecord(input: {
    readonly amount: number;
    readonly sessionId: string;
    readonly userId: string;
  }): Promise<void> {
    const walletPaymentMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        userId: input.userId,
        gateway: PaymentGateway.WALLET,
        isDefault: true,
      },
      select: {
        id: true,
      },
    });

    if (walletPaymentMethod === null) {
      throw new BadRequestException('Wallet payment method not found');
    }

    await this.prismaService.payment.create({
      data: {
        userId: input.userId,
        sessionId: input.sessionId,
        paymentMethodId: walletPaymentMethod.id,
        gateway: PaymentGateway.WALLET,
        status: PaymentStatus.CAPTURED,
        amount: input.amount,
        authorizedAmount: input.amount,
        capturedAmount: input.amount,
      },
      select: {
        id: true,
      },
    });
  }
}
