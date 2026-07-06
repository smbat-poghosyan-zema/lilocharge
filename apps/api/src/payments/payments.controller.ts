import type { PaymentMethodResponse } from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { ExchangeApplePayTokenDto } from './dto/exchange-apple-pay-token.dto';
import { ExchangeGooglePayTokenDto } from './dto/exchange-google-pay-token.dto';
import { RegisterPaymentMethodDto } from './dto/register-payment-method.dto';
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

  /** Lists all stored payment methods for the requested user. */
  @Get('methods')
  public async listPaymentMethods(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PaymentMethodResponse[]> {
    return this.paymentsService.listPaymentMethods(userId);
  }

  /** Registers one tokenized ArCa/Idram payment method for the requested user. */
  @Post('methods')
  public async registerPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RegisterPaymentMethodDto,
  ): Promise<PaymentMethodResponse> {
    return this.paymentsService.registerPaymentMethod(userId, dto);
  }

  /** Removes one stored payment method owned by the requested user. */
  @Delete('methods/:methodId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deletePaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ): Promise<void> {
    await this.paymentsService.deletePaymentMethod(userId, methodId);
  }

  /** Sets one stored payment method as the requested user's default. */
  @Patch('methods/:methodId/default')
  public async setDefaultPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ): Promise<PaymentMethodResponse> {
    return this.paymentsService.setDefaultPaymentMethod(userId, methodId);
  }

  /** Sets LiloCharge wallet as the user's default payment method. */
  @Post('wallet')
  public async setWalletAsPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PaymentMethodResponse> {
    return this.paymentsService.setWalletAsPaymentMethod(userId);
  }
}
