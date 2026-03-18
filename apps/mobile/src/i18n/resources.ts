import type { SupportedLanguageCode } from '@lilocharge/shared-types';
import type { Resource } from 'i18next';

import enCommon from './locales/en/common.json';
import hyCommon from './locales/hy/common.json';
import ruCommon from './locales/ru/common.json';

export const DEFAULT_LANGUAGE: SupportedLanguageCode = 'hy';
export const SUPPORTED_LANGUAGES: readonly SupportedLanguageCode[] = ['hy', 'ru', 'en'];

const enCommonSchema: typeof hyCommon = enCommon;
const ruCommonSchema: typeof hyCommon = ruCommon;

/**
 * Translation catalog resources keyed by supported language codes.
 */
export const TRANSLATION_RESOURCES = {
  en: {
    common: enCommonSchema,
  },
  hy: {
    common: hyCommon,
  },
  ru: {
    common: ruCommonSchema,
  },
} satisfies Resource;
