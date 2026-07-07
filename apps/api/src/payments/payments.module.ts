import { forwardRef, Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { ApplePayClient } from './apple-pay.client';
import { ArcaClient } from './arca.client';
import { GooglePayClient } from './google-pay.client';
import { IdramClient } from './idram.client';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhookSignatureVerifier } from './webhook-signature.verifier';

/** Feature module providing ArCa/Idram/Apple Pay gateway integrations for setup and session billing flows. */
@Module({
  imports: [NotificationsModule, PrismaModule, forwardRef(() => WalletModule)],
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [
    ApplePayClient,
    ArcaClient,
    GooglePayClient,
    IdramClient,
    PaymentWebhooksService,
    PaymentsService,
    WebhookSignatureVerifier,
  ],
  exports: [PaymentsService, ArcaClient, IdramClient, ApplePayClient, GooglePayClient],
})
export class PaymentsModule {}
