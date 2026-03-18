import i18n, { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './i18n';

describe('i18n configuration', () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it('initializes with Armenian as the default language', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(i18n.t('tabs.stations.title')).toBe('Կայաններ');
  });

  it('supports Armenian, Russian, and English language codes', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['hy', 'ru', 'en']);
  });

  it('returns localized values for each supported language', async () => {
    await i18n.changeLanguage('ru');
    expect(i18n.t('tabs.stations.title')).toBe('Станции');

    await i18n.changeLanguage('en');
    expect(i18n.t('tabs.stations.title')).toBe('Stations');
  });
});
