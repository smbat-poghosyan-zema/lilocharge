import type { RegisterPushTokenRequest } from '@lilocharge/shared-types';
import { PushNotificationPlatform } from '@lilocharge/shared-types';
import { IsEnum, IsString, MinLength } from 'class-validator';

/** DTO used to register one user device token for push notification delivery. */
export class RegisterPushTokenDto implements RegisterPushTokenRequest {
  @IsEnum(PushNotificationPlatform)
  public platform!: PushNotificationPlatform;

  @IsString()
  @MinLength(10)
  public token!: string;
}
