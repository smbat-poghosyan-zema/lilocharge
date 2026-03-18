import type { UnregisterPushTokenRequest } from '@lilocharge/shared-types';
import { IsString, MinLength } from 'class-validator';

/** DTO used to unregister one user device token from push notification delivery. */
export class UnregisterPushTokenDto implements UnregisterPushTokenRequest {
  @IsString()
  @MinLength(10)
  public token!: string;
}
