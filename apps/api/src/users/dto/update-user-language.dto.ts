import type { SupportedLanguageCode, UpdateUserLanguageRequest } from '@lilocharge/shared-types';
import { IsIn } from 'class-validator';

const SUPPORTED_LANGUAGES: readonly SupportedLanguageCode[] = ['hy', 'ru', 'en'];

/** DTO used to switch a user's preferred language. */
export class UpdateUserLanguageDto implements UpdateUserLanguageRequest {
  @IsIn(SUPPORTED_LANGUAGES)
  public language!: SupportedLanguageCode;
}
