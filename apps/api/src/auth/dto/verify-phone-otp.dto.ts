import type { SupportedLanguageCode } from '@lilocharge/shared-types';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const OTP_CODE_REGEX = /^\d{6}$/;
const SUPPORTED_LANGUAGES: readonly SupportedLanguageCode[] = ['hy', 'ru', 'en'];

/** DTO used to verify phone OTP and complete account registration. */
export class VerifyPhoneOtpDto {
  @Matches(OTP_CODE_REGEX)
  @Length(6, 6)
  public code!: string;

  @IsString()
  @MaxLength(255)
  public displayName!: string;

  @IsEmail()
  public email!: string;

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  public language?: SupportedLanguageCode;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public password!: string;

  @Matches(E164_PHONE_REGEX)
  public phone!: string;
}
