import type { SupportedLanguageCode } from '@lilocharge/shared-types';
import { MMKV } from 'react-native-mmkv';

import { SUPPORTED_LANGUAGES } from './resources';

const LANGUAGE_PREFERENCE_STORAGE_KEY = 'i18n.language-preference.v1';

/** Minimal MMKV driver surface used by the language preference storage. */
interface LanguagePreferenceDriver {
  delete(key: string): void;
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** Contract for persisted UI language preference operations. */
export interface LanguagePreferenceStorage {
  readonly clearPersistedLanguage: () => void;
  readonly persistLanguage: (language: SupportedLanguageCode) => void;
  readonly readPersistedLanguage: () => SupportedLanguageCode | null;
}

/**
 * Creates an MMKV-backed storage adapter for the user's UI language choice.
 */
export function createLanguagePreferenceStorage(
  driver: LanguagePreferenceDriver,
): LanguagePreferenceStorage {
  return {
    clearPersistedLanguage: (): void => {
      driver.delete(LANGUAGE_PREFERENCE_STORAGE_KEY);
    },

    persistLanguage: (language: SupportedLanguageCode): void => {
      driver.set(LANGUAGE_PREFERENCE_STORAGE_KEY, language);
    },

    readPersistedLanguage: (): SupportedLanguageCode | null => {
      const rawValue = driver.getString(LANGUAGE_PREFERENCE_STORAGE_KEY);

      return isSupportedLanguageCode(rawValue) ? rawValue : null;
    },
  };
}

const defaultLanguagePreferenceMmkvStorage = new MMKV({
  id: 'lilocharge-language-preference',
});

/** Shared app-wide language preference storage singleton. */
export const languagePreferenceStorage = createLanguagePreferenceStorage(
  defaultLanguagePreferenceMmkvStorage,
);

/**
 * Reads the persisted UI language used to seed i18n initialization.
 */
export function readPersistedLanguage(): SupportedLanguageCode | null {
  return languagePreferenceStorage.readPersistedLanguage();
}

/**
 * Persists the UI language selected by the user across cold starts.
 */
export function persistLanguage(language: SupportedLanguageCode): void {
  languagePreferenceStorage.persistLanguage(language);
}

/**
 * Type guard validating raw persisted values against supported language codes.
 */
function isSupportedLanguageCode(value: string | undefined): value is SupportedLanguageCode {
  return (
    value !== undefined && SUPPORTED_LANGUAGES.includes(value as SupportedLanguageCode)
  );
}
