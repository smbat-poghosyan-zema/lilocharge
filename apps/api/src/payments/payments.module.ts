import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplePayClient } from './apple-pay.client';
import { ArcaClient } from './arca.client';
import { GooglePayClient } from './google-pay.client';
import { IdramClient } from './idram.client';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/** Feature module providing ArCa/Idram/Apple Pay gateway integrations for setup and session billing flows. */
@Module({
  imports: [NotificationsModule, PrismaModule],
  controllers: [PaymentsController],
  providers: [ApplePayClient, ArcaClient, GooglePayClient, IdramClient, PaymentsService],
  exports: [PaymentsService, ArcaClient, IdramClient, ApplePayClient, GooglePayClient],
})
export class PaymentsModule {}
