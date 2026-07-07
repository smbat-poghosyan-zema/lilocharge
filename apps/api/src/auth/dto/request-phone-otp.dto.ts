import type { SupportedLanguageCode } from '@lilocharge/shared-types';
import { IsIn, IsOptional, Matches } from 'class-validator';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const SUPPORTED_LANGUAGES: readonly SupportedLanguageCode[] = ['hy', 'ru', 'en'];

/** DTO used to request an OTP for a phone number. */
export class RequestPhoneOtpDto {
  @Matches(E164_PHONE_REGEX)
  public phone!: string;

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  public language?: SupportedLanguageCode;
}
