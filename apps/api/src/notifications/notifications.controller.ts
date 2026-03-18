import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { NotificationsService } from './notifications.service';

/** Controller exposing user-device push token registration endpoints. */
@ApiTags('notifications')
@Controller('users/:userId/notifications')
@UseGuards(IdorGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Registers one device token for user push notification delivery. */
  @Post('push-tokens')
  public async registerPushToken(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<void> {
    await this.notificationsService.registerPushToken(userId, dto);
  }

  /** Unregisters one device token to stop user push notification delivery. */
  @Post('push-tokens/unregister')
  public async unregisterPushToken(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UnregisterPushTokenDto,
  ): Promise<void> {
    await this.notificationsService.unregisterPushToken(userId, dto);
  }
}
