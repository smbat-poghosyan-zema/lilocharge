import type {
  WalletResponse,
  WalletTopUpResponse,
  WalletTransactionsResponse,
} from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { GetWalletTransactionsDto } from './dto/get-wallet-transactions.dto';
import { TopUpWalletDto } from './dto/top-up-wallet.dto';
import { WalletService } from './wallet.service';

/**
 * Controller exposing wallet balance, top-up, and transaction history endpoints.
 * Allows users to manage their in-app wallet for instant charging session payments.
 */
@ApiTags('wallet')
@Controller('users/:userId/wallet')
@UseGuards(IdorGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Retrieves the current wallet balance for the specified user.
   * Creates a wallet with zero balance if one doesn't exist.
   */
  @Get()
  public async getWallet(@Param('userId', ParseUUIDPipe) userId: string): Promise<WalletResponse> {
    return this.walletService.getOrCreateWallet(userId);
  }

  /**
   * Tops up wallet balance via ArCa or Idram payment gateway.
   * Charges the specified amount and credits it to the user's wallet.
   */
  @Post('top-up')
  public async topUp(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: TopUpWalletDto,
  ): Promise<WalletTopUpResponse> {
    return this.walletService.topUp({
      userId,
      amount: dto.amount,
      gateway: dto.gateway,
      paymentMethodId: dto.paymentMethodId,
    });
  }

  /**
   * Fetches paginated wallet transaction history.
   * Supports filtering by transaction type (TOP_UP, DEDUCTION, REFUND).
   */
  @Get('transactions')
  public async getTransactions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: GetWalletTransactionsDto,
  ): Promise<WalletTransactionsResponse> {
    return this.walletService.getTransactions(userId, {
      type: query.type,
      limit: query.limit,
      cursor: query.cursor,
    });
  }
}
