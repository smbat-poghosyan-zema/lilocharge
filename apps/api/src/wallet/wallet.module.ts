import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * Module providing wallet balance management, top-up flows, and transaction history.
 * Integrates with ArCa/Idram payment gateways for wallet top-ups.
 */
@Module({
  imports: [PrismaModule, PaymentsModule, NotificationsModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
