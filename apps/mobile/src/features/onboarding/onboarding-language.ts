import type { SupportedLanguageCode } from '@lilocharge/shared-types';

/**
 * Maps arbitrary i18next language identifiers to supported API language codes.
 */
export function resolveSupportedLanguage(language: string): SupportedLanguageCode {
  const normalized = language.trim().toLowerCase();

  if (normalized.startsWith('ru')) {
    return 'ru';
  }

  if (normalized.startsWith('en')) {
    return 'en';
  }

  return 'hy';
}
