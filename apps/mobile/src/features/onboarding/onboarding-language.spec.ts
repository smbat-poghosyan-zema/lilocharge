import { resolveSupportedLanguage } from './onboarding-language';

describe('resolveSupportedLanguage', () => {
  it('maps Armenian variants to hy', () => {
    expect(resolveSupportedLanguage('hy')).toBe('hy');
    expect(resolveSupportedLanguage('hy-AM')).toBe('hy');
  });

  it('maps Russian variants to ru', () => {
    expect(resolveSupportedLanguage('ru')).toBe('ru');
    expect(resolveSupportedLanguage('ru-RU')).toBe('ru');
  });

  it('maps English variants to en', () => {
    expect(resolveSupportedLanguage('en')).toBe('en');
    expect(resolveSupportedLanguage('en-US')).toBe('en');
  });

  it('falls back to hy for unknown languages', () => {
    expect(resolveSupportedLanguage('fr')).toBe('hy');
  });
});
