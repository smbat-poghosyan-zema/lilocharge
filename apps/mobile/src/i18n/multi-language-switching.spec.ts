import i18n, { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './i18n';

/**
 * Test suite for multi-language switching functionality.
 * Verifies that the UI correctly updates when switching between
 * Armenian, Russian, and English languages.
 */
describe('Multi-Language Switching', () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it('initializes with Armenian (default language)', () => {
    expect(i18n.language).toBe('hy');
    expect(i18n.t('tabs.stations.title')).toBe('Կայաններ');
    expect(i18n.t('tabs.favorites.title')).toBe('Սիրված');
    expect(i18n.t('tabs.profile.title')).toBe('Անձնական');
  });

  describe('switching to Russian', () => {
    it('updates all UI strings to Russian', async () => {
      await i18n.changeLanguage('ru');

      expect(i18n.language).toBe('ru');
      expect(i18n.t('tabs.stations.title')).toBe('Станции');
      expect(i18n.t('tabs.favorites.title')).toBe('Избранное');
      expect(i18n.t('tabs.profile.title')).toBe('Профиль');
    });

    it('translates station map strings to Russian', async () => {
      await i18n.changeLanguage('ru');

      expect(i18n.t('stations.map.loading')).toBe('Обновляем станции...');
      expect(i18n.t('stations.map.refreshError')).toBe('Не удалось обновить данные станций.');
      expect(i18n.t('stations.map.camera.recenter')).toBe('Центрировать карту');
    });

    it('translates onboarding registration strings to Russian', async () => {
      await i18n.changeLanguage('ru');

      expect(i18n.t('onboarding.registration.title')).toBe('Создайте аккаунт');
      expect(i18n.t('onboarding.registration.fields.displayName')).toBe('Имя и фамилия');
      expect(i18n.t('onboarding.registration.fields.email')).toBe('Эл. почта');
      expect(i18n.t('onboarding.registration.actions.continue')).toBe(
        'Отправить код подтверждения',
      );
    });

    it('translates connector status to Russian', async () => {
      await i18n.changeLanguage('ru');

      expect(i18n.t('stations.map.sheet.status.available')).toBe('Доступна');
      expect(i18n.t('stations.map.sheet.status.occupied')).toBe('Занята');
      expect(i18n.t('stations.map.sheet.status.offline')).toBe('Недоступна');
      expect(i18n.t('stations.map.sheet.status.maintenance')).toBe('Обслуживание');
    });

    it('translates payment methods to Russian', async () => {
      await i18n.changeLanguage('ru');

      expect(i18n.t('onboarding.payment.methods.ARCA')).toBe('Карты ArCa');
      expect(i18n.t('onboarding.payment.methods.IDRAM')).toBe('Кошелек Idram');
      expect(i18n.t('onboarding.payment.methods.APPLE_PAY')).toBe('Apple Pay');
      expect(i18n.t('onboarding.payment.methods.GOOGLE_PAY')).toBe('Google Pay');
    });
  });

  describe('switching to English', () => {
    it('updates all UI strings to English', async () => {
      await i18n.changeLanguage('en');

      expect(i18n.language).toBe('en');
      expect(i18n.t('tabs.stations.title')).toBe('Stations');
      expect(i18n.t('tabs.favorites.title')).toBe('Favorites');
      expect(i18n.t('tabs.profile.title')).toBe('Profile');
    });

    it('translates station map strings to English', async () => {
      await i18n.changeLanguage('en');

      expect(i18n.t('stations.map.loading')).toBe('Refreshing stations...');
      expect(i18n.t('stations.map.refreshError')).toBe('Failed to refresh station data.');
      expect(i18n.t('stations.map.camera.recenter')).toBe('Recenter map');
    });

    it('translates onboarding registration strings to English', async () => {
      await i18n.changeLanguage('en');

      expect(i18n.t('onboarding.registration.title')).toBe('Create your account');
      expect(i18n.t('onboarding.registration.fields.displayName')).toBe('Full name');
      expect(i18n.t('onboarding.registration.fields.email')).toBe('Email');
      expect(i18n.t('onboarding.registration.actions.continue')).toBe('Send verification code');
    });

    it('translates connector status to English', async () => {
      await i18n.changeLanguage('en');

      expect(i18n.t('stations.map.sheet.status.available')).toBe('Available');
      expect(i18n.t('stations.map.sheet.status.occupied')).toBe('Occupied');
      expect(i18n.t('stations.map.sheet.status.offline')).toBe('Offline');
      expect(i18n.t('stations.map.sheet.status.maintenance')).toBe('Maintenance');
    });

    it('translates payment methods to English', async () => {
      await i18n.changeLanguage('en');

      expect(i18n.t('onboarding.payment.methods.ARCA')).toBe('ArCa cards');
      expect(i18n.t('onboarding.payment.methods.IDRAM')).toBe('Idram wallet');
      expect(i18n.t('onboarding.payment.methods.APPLE_PAY')).toBe('Apple Pay');
      expect(i18n.t('onboarding.payment.methods.GOOGLE_PAY')).toBe('Google Pay');
    });
  });

  describe('sequential language switching', () => {
    it('switches from Armenian -> Russian -> English and verifies each step', async () => {
      // Start with Armenian
      expect(i18n.language).toBe('hy');
      expect(i18n.t('stations.title')).toBe('Լիցքավորման կայաններ');

      // Switch to Russian
      await i18n.changeLanguage('ru');
      expect(i18n.language).toBe('ru');
      expect(i18n.t('stations.title')).toBe('Зарядные станции');

      // Switch to English
      await i18n.changeLanguage('en');
      expect(i18n.language).toBe('en');
      expect(i18n.t('stations.title')).toBe('Charging Stations');
    });

    it('switches from English -> Armenian -> Russian and verifies each step', async () => {
      // Start with English
      await i18n.changeLanguage('en');
      expect(i18n.language).toBe('en');
      expect(i18n.t('favorites.title')).toBe('Favorite Stations');

      // Switch to Armenian
      await i18n.changeLanguage('hy');
      expect(i18n.language).toBe('hy');
      expect(i18n.t('favorites.title')).toBe('Սիրված կայաններ');

      // Switch to Russian
      await i18n.changeLanguage('ru');
      expect(i18n.language).toBe('ru');
      expect(i18n.t('favorites.title')).toBe('Избранные станции');
    });

    it('handles rapid language switching without errors', async () => {
      // Rapidly switch between languages
      for (const lang of SUPPORTED_LANGUAGES) {
        await i18n.changeLanguage(lang);
        expect(i18n.language).toBe(lang);
        expect(i18n.t('tabs.stations.title')).toBeTruthy();
      }

      // Verify final state is stable
      expect(i18n.isInitialized).toBe(true);
    });
  });

  describe('complex translation strings', () => {
    it('handles interpolation in Russian', async () => {
      await i18n.changeLanguage('ru');

      const phoneNumber = '+37477123456';
      const translatedText = i18n.t('onboarding.verifyPhone.subtitle', { phone: phoneNumber });
      expect(translatedText).toBe(`Введите 6-значный код, отправленный на ${phoneNumber}.`);
    });

    it('handles interpolation in English', async () => {
      await i18n.changeLanguage('en');

      const phoneNumber = '+37477987654';
      const translatedText = i18n.t('onboarding.verifyPhone.subtitle', { phone: phoneNumber });
      expect(translatedText).toBe(`Enter the 6-digit code sent to ${phoneNumber}.`);
    });

    it('handles interpolation in Armenian', async () => {
      await i18n.changeLanguage('hy');

      const phoneNumber = '+37477555555';
      const translatedText = i18n.t('onboarding.verifyPhone.subtitle', { phone: phoneNumber });
      expect(translatedText).toBe(`Մուտքագրեք 6 նիշ կոդը, ուղարկված ${phoneNumber} համարին:`);
    });

    it('handles numeric interpolation for pricing in Russian', async () => {
      await i18n.changeLanguage('ru');

      const amount = '500';
      const pricingText = i18n.t('stations.map.sheet.pricingPerKwh', { amount });
      expect(pricingText).toBe(`${amount}/кВт⋅ч`);
    });

    it('handles numeric interpolation for pricing in English', async () => {
      await i18n.changeLanguage('en');

      const amount = '300';
      const pricingText = i18n.t('stations.map.sheet.pricingPerKwh', { amount });
      expect(pricingText).toBe(`${amount}/kWh`);
    });

    it('handles numeric interpolation for pricing in Armenian', async () => {
      await i18n.changeLanguage('hy');

      const amount = '450';
      const pricingText = i18n.t('stations.map.sheet.pricingPerKwh', { amount });
      expect(pricingText).toBe(`${amount}/kWh`);
    });

    it('handles review summary interpolation in Russian', async () => {
      await i18n.changeLanguage('ru');

      const reviewText = i18n.t('stations.map.sheet.reviewSummary', { rating: 4.5, count: 123 });
      expect(reviewText).toBe('4.5/5 · 123 отзывов');
    });

    it('handles review summary interpolation in English', async () => {
      await i18n.changeLanguage('en');

      const reviewText = i18n.t('stations.map.sheet.reviewSummary', { rating: 4.8, count: 456 });
      expect(reviewText).toBe('4.8/5 · 456 reviews');
    });

    it('handles review summary interpolation in Armenian', async () => {
      await i18n.changeLanguage('hy');

      const reviewText = i18n.t('stations.map.sheet.reviewSummary', { rating: 4.2, count: 789 });
      expect(reviewText).toBe('4.2/5 · 789 կարծիք');
    });
  });

  describe('fallback behavior', () => {
    it('falls back to Armenian for unsupported language codes', async () => {
      // Use an unsupported language code that will fallback to default
      await i18n.changeLanguage('fr');

      // Should fall back to default language (Armenian)
      expect(i18n.t('tabs.stations.title')).toBe('Կայաններ');
    });

    it('maintains current language for missing translation keys', async () => {
      await i18n.changeLanguage('ru');

      // Access a non-existent key - should return the key itself
      const missingKey = 'nonexistent.key.path';
      expect(i18n.t(missingKey)).toBe(missingKey);
    });
  });

  describe('language persistence across changes', () => {
    it('maintains language setting after multiple switches', async () => {
      // Switch through all languages
      await i18n.changeLanguage('ru');
      await i18n.changeLanguage('en');
      await i18n.changeLanguage('hy');

      // Verify current language is correctly set
      expect(i18n.language).toBe('hy');
      expect(i18n.t('profile.title')).toBe('Անձնական հաշիվ');
    });

    it('returns correct language after being set to English', async () => {
      await i18n.changeLanguage('en');

      // Verify language persists
      expect(i18n.language).toBe('en');
      expect(i18n.t('stations.subtitle')).toBe('Find nearby stations and check availability.');
    });
  });

  describe('all supported languages have required keys', () => {
    const criticalKeys = [
      'tabs.stations.title',
      'tabs.favorites.title',
      'tabs.profile.title',
      'stations.title',
      'favorites.title',
      'profile.title',
      'onboarding.registration.title',
      'onboarding.verifyPhone.title',
      'onboarding.vehicle.title',
      'onboarding.payment.title',
    ];

    SUPPORTED_LANGUAGES.forEach((lang) => {
      it(`has all critical keys in ${lang}`, async () => {
        await i18n.changeLanguage(lang);

        criticalKeys.forEach((key) => {
          const translation = i18n.t(key);
          // Translation should not be the key itself (which indicates missing translation)
          expect(translation).not.toBe(key);
          // Translation should not be empty
          expect(translation.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('connector type translations', () => {
    it('translates connector types consistently across all languages', async () => {
      const connectorTypes = ['CCS', 'CHADEMO', 'TYPE_1', 'TYPE_2', 'TESLA', 'GBT'];

      for (const lang of SUPPORTED_LANGUAGES) {
        await i18n.changeLanguage(lang);

        connectorTypes.forEach((type) => {
          const translation = i18n.t(`onboarding.vehicle.connectorTypes.${type}`);
          expect(translation).toBeTruthy();
          expect(translation.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('error messages', () => {
    it('translates error messages to Russian', async () => {
      await i18n.changeLanguage('ru');

      expect(i18n.t('onboarding.registration.errors.displayNameRequired')).toBe(
        'Введите имя и фамилию',
      );
      expect(i18n.t('onboarding.registration.errors.invalidEmail')).toBe(
        'Введите корректный email',
      );
      expect(i18n.t('onboarding.registration.errors.passwordTooShort')).toBe(
        'Пароль должен быть не короче 8 символов',
      );
    });

    it('translates error messages to English', async () => {
      await i18n.changeLanguage('en');

      expect(i18n.t('onboarding.registration.errors.displayNameRequired')).toBe(
        'Enter your full name',
      );
      expect(i18n.t('onboarding.registration.errors.invalidEmail')).toBe(
        'Enter a valid email address',
      );
      expect(i18n.t('onboarding.registration.errors.passwordTooShort')).toBe(
        'Password must be at least 8 characters',
      );
    });

    it('translates error messages to Armenian', async () => {
      await i18n.changeLanguage('hy');

      expect(i18n.t('onboarding.registration.errors.displayNameRequired')).toBe(
        'Մուտքագրեք անունը և ազգանունը',
      );
      expect(i18n.t('onboarding.registration.errors.invalidEmail')).toBe(
        'Մուտքագրեք վավեր էլ. հասցե',
      );
      expect(i18n.t('onboarding.registration.errors.passwordTooShort')).toBe(
        'Գաղտնաբառը պետք է առնվազն 8 նիշ լինի',
      );
    });
  });
});
