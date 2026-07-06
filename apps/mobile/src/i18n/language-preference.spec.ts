import { createLanguagePreferenceStorage } from './language-preference';

/**
 * Builds an in-memory MMKV-like driver for language preference tests.
 */
function createDriverMock(): {
  delete(key: string): void;
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
} {
  const valueByKey = new Map<string, string>();

  return {
    delete: (key: string): void => {
      valueByKey.delete(key);
    },
    getString: (key: string): string | undefined => {
      return valueByKey.get(key);
    },
    set: (key: string, value: string): void => {
      valueByKey.set(key, value);
    },
  };
}

describe('language preference storage', () => {
  it('returns null when no language has been persisted yet', () => {
    const storage = createLanguagePreferenceStorage(createDriverMock());

    expect(storage.readPersistedLanguage()).toBeNull();
  });

  it('persists and reads back each supported language code', () => {
    const storage = createLanguagePreferenceStorage(createDriverMock());

    storage.persistLanguage('ru');
    expect(storage.readPersistedLanguage()).toBe('ru');

    storage.persistLanguage('en');
    expect(storage.readPersistedLanguage()).toBe('en');

    storage.persistLanguage('hy');
    expect(storage.readPersistedLanguage()).toBe('hy');
  });

  it('ignores unsupported persisted values', () => {
    const driver = createDriverMock();
    const storage = createLanguagePreferenceStorage(driver);

    driver.set('i18n.language-preference.v1', 'fr');

    expect(storage.readPersistedLanguage()).toBeNull();
  });

  it('clears the persisted language preference', () => {
    const storage = createLanguagePreferenceStorage(createDriverMock());

    storage.persistLanguage('en');
    storage.clearPersistedLanguage();

    expect(storage.readPersistedLanguage()).toBeNull();
  });
});
