import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATION_RESOURCES } from './resources';

const DEFAULT_NAMESPACE = 'common';

/**
 * Initializes the singleton i18next instance for the mobile app.
 */
export function initializeI18n(): I18nInstance {
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      defaultNS: DEFAULT_NAMESPACE,
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: {
        escapeValue: false,
      },
      lng: DEFAULT_LANGUAGE,
      ns: [DEFAULT_NAMESPACE],
      react: {
        useSuspense: false,
      },
      resources: TRANSLATION_RESOURCES,
      supportedLngs: SUPPORTED_LANGUAGES,
    });
  }

  return i18next;
}

const i18n = initializeI18n();

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES };
export default i18n;
