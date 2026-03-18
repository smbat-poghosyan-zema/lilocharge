import type { PaymentMethodResponse } from '@lilocharge/shared-types';
import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { ExchangeApplePayTokenDto } from './dto/exchange-apple-pay-token.dto';
import { ExchangeGooglePayTokenDto } from './dto/exchange-google-pay-token.dto';
import { PaymentsService } from './payments.service';

/** Controller exposing payment-method setup and token-exchange endpoints. */
@ApiTags('payments')
@Controller('users/:userId/payments')
@UseGuards(IdorGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Exchanges one Apple Pay token and stores resulting payment method for the user. */
  @Post('apple-pay/token-exchange')
  public async exchangeApplePayToken(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ExchangeApplePayTokenDto,
  ): Promise<PaymentMethodResponse> {
    return this.paymentsService.exchangeApplePayToken(userId, dto);
  }

  /** Exchanges one Google Pay token and stores resulting payment method for the user. */
  @Post('google-pay/token-exchange')
  public async exchangeGooglePayToken(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ExchangeGooglePayTokenDto,
  ): Promise<PaymentMethodResponse> {
    return this.paymentsService.exchangeGooglePayToken(userId, dto);
  }

  /** Sets LiloCharge wallet as the user's default payment method. */
  @Post('wallet')
  public async setWalletAsPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PaymentMethodResponse> {
    return this.paymentsService.setWalletAsPaymentMethod(userId);
  }
}
