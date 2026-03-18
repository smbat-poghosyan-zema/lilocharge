import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FcmAdminClient } from './fcm-admin.client';
import { NotificationTemplatesService } from './notification-templates.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Feature module providing FCM token registration and push notification orchestration services. */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [FcmAdminClient, NotificationTemplatesService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
