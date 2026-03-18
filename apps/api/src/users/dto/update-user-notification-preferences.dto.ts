import type { UpdateUserNotificationPreferencesRequest } from '@lilocharge/shared-types';
import { IsBoolean, IsOptional } from 'class-validator';

/** DTO used to update push and marketing notification preference flags. */
export class UpdateUserNotificationPreferencesDto implements UpdateUserNotificationPreferencesRequest {
  @IsOptional()
  @IsBoolean()
  public pushNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  public marketingNotificationsEnabled?: boolean;
}
