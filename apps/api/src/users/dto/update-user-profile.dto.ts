import type { UpdateUserProfileRequest } from '@lilocharge/shared-types';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

/** DTO used to update editable profile fields on an existing user account. */
export class UpdateUserProfileDto implements UpdateUserProfileRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  public displayName?: string;

  @IsOptional()
  @Matches(E164_PHONE_REGEX)
  public phone?: string;
}
