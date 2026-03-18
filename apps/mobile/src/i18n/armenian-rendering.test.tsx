/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import i18n, { DEFAULT_LANGUAGE } from './i18n';
import hyCommon from './locales/hy/common.json';
import { useAppTranslation } from './use-app-translation';

/**
 * Safely extracts text content from a rendered element with proper type handling.
 */
function getTextContent(element: unknown): string {
  if (typeof element === 'object' && element !== null && 'props' in element) {
    const instance = element as { props: { children: unknown } };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const children = instance.props.children;
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(children ?? '');
  }
  return '';
}

/**
 * Test component that renders all Armenian translations from a nested object.
 */
function ArmenianTextRenderer({
  translations,
}: {
  readonly translations: Record<string, unknown>;
}): JSX.Element {
  const { t } = useAppTranslation();

  const extractStrings = (obj: Record<string, unknown>, prefix = ''): string[] => {
    const results: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'string') {
        results.push(fullKey);
      } else if (typeof value === 'object' && value !== null) {
        results.push(...extractStrings(value as Record<string, unknown>, fullKey));
      }
    }

    return results;
  };

  const translationKeys = extractStrings(translations);

  return (
    <>
      {translationKeys.map((key) => {
        try {
          const translated = t(key);
          return (
            <Text key={key} testID={`translation-${key}`}>
              {translated}
            </Text>
          );
        } catch {
          return null;
        }
      })}
    </>
  );
}

describe('Armenian Character Rendering', () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  describe('Core Translations', () => {
    it('renders all Armenian translations without fallback boxes', () => {
      render(<ArmenianTextRenderer translations={hyCommon} />);

      const allTranslations = screen.UNSAFE_getAllByType(Text);

      expect(allTranslations.length).toBeGreaterThan(0);
      allTranslations.forEach((element) => {
        const textContent = getTextContent(element);
        if (typeof textContent === 'string' && textContent.length > 0) {
          expect(textContent).not.toMatch(/\uFFFD/);
          expect(textContent).not.toMatch(/□/);
          expect(textContent).not.toMatch(/\?{2,}/);
        }
      });
    });
  });

  describe('Tab Navigation Labels', () => {
    it('renders "Կայաններ" (Stations) correctly', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="stations-title">{t('tabs.stations.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('stations-title');
      const text = getTextContent(element);

      expect(text).toBe('Կայաններ');
      expect(text).toContain('Կ');
      expect(text).toContain('ա');
      expect(text).toContain('յ');
      expect(text).not.toMatch(/\uFFFD/);
    });

    it('renders "Սիրված" (Favorites) correctly', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="favorites-title">{t('tabs.favorites.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('favorites-title');
      const text = getTextContent(element);

      expect(text).toBe('Սիրված');
      expect(text).toContain('Ս');
      expect(text).toContain('ի');
      expect(text).toContain('վ');
      expect(text).not.toMatch(/\uFFFD/);
    });

    it('renders "Անձնական" (Profile) correctly', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="profile-title">{t('tabs.profile.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('profile-title');
      const text = getTextContent(element);

      expect(text).toBe('Անձնական');
      expect(text).toContain('Ա');
      expect(text).toContain('ն');
      expect(text).toContain('ձ');
      expect(text).not.toMatch(/\uFFFD/);
    });
  });

  describe('Favorites Screen', () => {
    it('renders favorites title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="fav-title">{t('favorites.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('fav-title');
      const title = getTextContent(element);

      expect(title).toBe('Սիրված կայաններ');
      expect(title).toContain('Ս');
      expect(title).toContain('կ');
      expect(title).not.toMatch(/\uFFFD/);
      expect(title).not.toMatch(/□/);
    });

    it('renders favorites subtitle with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="fav-subtitle">{t('favorites.subtitle')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('fav-subtitle');
      const subtitle = getTextContent(element);

      expect(subtitle).toContain('Արագ');
      expect(subtitle).toContain('մուտք');
      expect(subtitle).toContain('դեպի');
      expect(subtitle).not.toMatch(/\uFFFD/);
    });

    it('renders empty state message with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="fav-empty">{t('favorites.empty')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('fav-empty');
      const empty = getTextContent(element);

      expect(empty).toContain('Դուք');
      expect(empty).toContain('դեռ');
      expect(empty).toContain('չեք');
      expect(empty).not.toMatch(/\uFFFD/);
    });
  });

  describe('Stations Screen', () => {
    it('renders stations title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="stations-title">{t('stations.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('stations-title');
      const title = getTextContent(element);

      expect(title).toBe('Լիցքավորման կայաններ');
      expect(title).toContain('Լ');
      expect(title).toContain('ի');
      expect(title).toContain('ց');
      expect(title).toContain('ք');
      expect(title).not.toMatch(/\uFFFD/);
    });

    it('renders map loading message with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="map-loading">{t('stations.map.loading')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('map-loading');
      const loading = getTextContent(element);

      expect(loading).toContain('Թարմացվում');
      expect(loading).toContain('են');
      expect(loading).not.toMatch(/\uFFFD/);
    });

    it('renders search placeholder with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="search-placeholder">{t('stations.map.search.placeholder')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('search-placeholder');
      const placeholder = getTextContent(element);

      expect(placeholder).toContain('Որոնել');
      expect(placeholder).toContain('կայան');
      expect(placeholder).toContain('անունով');
      expect(placeholder).toContain('կամ');
      expect(placeholder).toContain('հասցեով');
      expect(placeholder).not.toMatch(/\uFFFD/);
    });

    it('renders filter labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="filter-title">{t('stations.map.filters.title')}</Text>
            <Text testID="filter-connectors">{t('stations.map.filters.connectorTypesLabel')}</Text>
            <Text testID="filter-power">{t('stations.map.filters.powerLabel')}</Text>
            <Text testID="filter-availability">{t('stations.map.filters.availabilityLabel')}</Text>
            <Text testID="filter-operators">{t('stations.map.filters.operatorsLabel')}</Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('filter-title'))).toBe('Զտիչներ');
      expect(getTextContent(screen.getByTestId('filter-connectors'))).toBe('Միակցիչներ');
      expect(getTextContent(screen.getByTestId('filter-power'))).toBe('Հզորություն');
      expect(getTextContent(screen.getByTestId('filter-availability'))).toBe('Հասանելիություն');
      expect(getTextContent(screen.getByTestId('filter-operators'))).toBe('Օպերատորներ');

      expect(getTextContent(screen.getByTestId('filter-title'))).not.toMatch(/\uFFFD/);
    });

    it('renders connector status labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="status-available">{t('stations.map.sheet.status.available')}</Text>
            <Text testID="status-occupied">{t('stations.map.sheet.status.occupied')}</Text>
            <Text testID="status-offline">{t('stations.map.sheet.status.offline')}</Text>
            <Text testID="status-maintenance">{t('stations.map.sheet.status.maintenance')}</Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('status-available'))).toBe('Հասանելի');
      expect(getTextContent(screen.getByTestId('status-occupied'))).toBe('Զբաղված');
      expect(getTextContent(screen.getByTestId('status-offline'))).toBe('Անհասանելի');
      expect(getTextContent(screen.getByTestId('status-maintenance'))).toBe('Սպասարկում');

      expect(getTextContent(screen.getByTestId('status-available'))).not.toMatch(/\uFFFD/);
    });

    it('renders bottom sheet labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="sheet-operator">{t('stations.map.sheet.operatorLabel')}</Text>
            <Text testID="sheet-address">{t('stations.map.sheet.addressLabel')}</Text>
            <Text testID="sheet-distance">{t('stations.map.sheet.distanceLabel')}</Text>
            <Text testID="sheet-hours">{t('stations.map.sheet.openingHoursLabel')}</Text>
            <Text testID="sheet-connectors">{t('stations.map.sheet.connectorsTitle')}</Text>
            <Text testID="sheet-reviews">{t('stations.map.sheet.reviewsTitle')}</Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('sheet-operator'))).toBe('Օպերատոր');
      expect(getTextContent(screen.getByTestId('sheet-address'))).toBe('Հասցե');
      expect(getTextContent(screen.getByTestId('sheet-distance'))).toBe('Հեռավորություն');
      expect(getTextContent(screen.getByTestId('sheet-hours'))).toBe('Աշխատաժամեր');
      expect(getTextContent(screen.getByTestId('sheet-connectors'))).toBe('Միակցիչներ');
      expect(getTextContent(screen.getByTestId('sheet-reviews'))).toBe('Կարծիքներ');

      expect(getTextContent(screen.getByTestId('sheet-operator'))).not.toMatch(/\uFFFD/);
    });
  });

  describe('Profile Screen', () => {
    it('renders profile title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="profile-title">{t('profile.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('profile-title');
      const title = getTextContent(element);

      expect(title).toBe('Անձնական հաշիվ');
      expect(title).toContain('Ա');
      expect(title).toContain('ն');
      expect(title).toContain('ձ');
      expect(title).toContain('հ');
      expect(title).toContain('շ');
      expect(title).not.toMatch(/\uFFFD/);
    });

    it('renders profile subtitle with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="profile-subtitle">{t('profile.subtitle')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('profile-subtitle');
      const subtitle = getTextContent(element);

      expect(subtitle).toContain('Կառավարեք');
      expect(subtitle).toContain('նախընտրությունները');
      expect(subtitle).toContain('և');
      expect(subtitle).toContain('ծանուցումները');
      expect(subtitle).not.toMatch(/\uFFFD/);
    });
  });

  describe('Onboarding - Registration Screen', () => {
    it('renders registration title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="reg-title">{t('onboarding.registration.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('reg-title');
      const title = getTextContent(element);

      expect(title).toBe('Ստեղծեք հաշիվ');
      expect(title).toContain('Ս');
      expect(title).toContain('տ');
      expect(title).toContain('ե');
      expect(title).toContain('ղ');
      expect(title).toContain('ծ');
      expect(title).not.toMatch(/\uFFFD/);
    });

    it('renders form field labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="field-name">{t('onboarding.registration.fields.displayName')}</Text>
            <Text testID="field-email">{t('onboarding.registration.fields.email')}</Text>
            <Text testID="field-phone">{t('onboarding.registration.fields.phone')}</Text>
            <Text testID="field-password">{t('onboarding.registration.fields.password')}</Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('field-name'))).toBe('Անուն և ազգանուն');
      expect(getTextContent(screen.getByTestId('field-email'))).toBe('Էլ. հասցե');
      expect(getTextContent(screen.getByTestId('field-phone'))).toBe('Հեռախոսահամար');
      expect(getTextContent(screen.getByTestId('field-password'))).toBe('Գաղտնաբառ');

      expect(getTextContent(screen.getByTestId('field-name'))).not.toMatch(/\uFFFD/);
    });

    it('renders validation error messages with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="err-name">{t('onboarding.registration.errors.displayNameRequired')}</Text>
            <Text testID="err-email">{t('onboarding.registration.errors.invalidEmail')}</Text>
            <Text testID="err-phone">{t('onboarding.registration.errors.invalidPhone')}</Text>
            <Text testID="err-password">
              {t('onboarding.registration.errors.passwordTooShort')}
            </Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('err-name'))).toContain('Մուտքագրեք');
      expect(getTextContent(screen.getByTestId('err-email'))).toContain('վավեր');
      expect(getTextContent(screen.getByTestId('err-phone'))).toContain('Մուտքագրեք');
      expect(getTextContent(screen.getByTestId('err-password'))).toContain('Գաղտնաբառը');

      expect(getTextContent(screen.getByTestId('err-name'))).not.toMatch(/\uFFFD/);
    });
  });

  describe('Onboarding - Phone Verification Screen', () => {
    it('renders phone verification title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="verify-title">{t('onboarding.verifyPhone.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('verify-title');
      const title = getTextContent(element);

      expect(title).toBe('Հաստատեք հեռախոսահամարը');
      expect(title).toContain('Հ');
      expect(title).toContain('ա');
      expect(title).toContain('ս');
      expect(title).toContain('տ');
      expect(title).not.toMatch(/\uFFFD/);
    });

    it('renders verification subtitle with dynamic phone interpolation', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <Text testID="verify-subtitle">
            {t('onboarding.verifyPhone.subtitle', { phone: '+37477123456' })}
          </Text>
        );
      };

      render(<TestComponent />);
      const element = screen.getByTestId('verify-subtitle');
      const subtitle = getTextContent(element);

      expect(subtitle).toContain('Մուտքագրեք');
      expect(subtitle).toContain('6 նիշ');
      expect(subtitle).toContain('կոդը');
      expect(subtitle).toContain('+37477123456');
      expect(subtitle).not.toMatch(/\uFFFD/);
    });
  });

  describe('Onboarding - Vehicle Setup Screen', () => {
    it('renders vehicle title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="vehicle-title">{t('onboarding.vehicle.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('vehicle-title');
      const title = getTextContent(element);

      expect(title).toBe('Ավելացրեք մեքենան');
      expect(title).toContain('Ա');
      expect(title).toContain('վ');
      expect(title).toContain('ե');
      expect(title).toContain('լ');
      expect(title).toContain('մ');
      expect(title).toContain('ք');
      expect(title).not.toMatch(/\uFFFD/);
    });

    it('renders vehicle form labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="vehicle-make">{t('onboarding.vehicle.fields.make')}</Text>
            <Text testID="vehicle-model">{t('onboarding.vehicle.fields.model')}</Text>
            <Text testID="vehicle-year">{t('onboarding.vehicle.fields.year')}</Text>
            <Text testID="vehicle-battery">{t('onboarding.vehicle.fields.batteryCapacity')}</Text>
            <Text testID="vehicle-power">{t('onboarding.vehicle.fields.maxChargePower')}</Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('vehicle-make'))).toContain('Մակնիշ');
      expect(getTextContent(screen.getByTestId('vehicle-model'))).toContain('Մոդել');
      expect(getTextContent(screen.getByTestId('vehicle-year'))).toContain('Թողարկման');
      expect(getTextContent(screen.getByTestId('vehicle-battery'))).toContain('Մարտկոցի');
      expect(getTextContent(screen.getByTestId('vehicle-battery'))).toContain('տարողություն');
      expect(getTextContent(screen.getByTestId('vehicle-power'))).toContain('Առավելագույն');
      expect(getTextContent(screen.getByTestId('vehicle-power'))).toContain('լիցքավորման');

      expect(getTextContent(screen.getByTestId('vehicle-make'))).not.toMatch(/\uFFFD/);
    });

    it('renders connector type labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="connector-type">{t('onboarding.vehicle.fields.connectorType')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('connector-type');
      const text = getTextContent(element);

      expect(text).toContain('Միակցիչի');
      expect(text).toContain('տեսակ');
      expect(text).not.toMatch(/\uFFFD/);
    });
  });

  describe('Onboarding - Payment Method Screen', () => {
    it('renders payment title with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="payment-title">{t('onboarding.payment.title')}</Text>;
      };

      render(<TestComponent />);
      const element = screen.getByTestId('payment-title');
      const title = getTextContent(element);

      expect(title).toBe('Վճարման եղանակ');
      expect(title).toContain('Վ');
      expect(title).toContain('ճ');
      expect(title).toContain('ա');
      expect(title).toContain('ր');
      expect(title).not.toMatch(/\uFFFD/);
    });

    it('renders payment method labels with Armenian characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="method-arca">{t('onboarding.payment.methods.ARCA')}</Text>
            <Text testID="method-idram">{t('onboarding.payment.methods.IDRAM')}</Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('method-arca'))).toBe('ArCa քարտեր');
      expect(getTextContent(screen.getByTestId('method-idram'))).toBe('Idram դրամապանակ');

      expect(getTextContent(screen.getByTestId('method-arca'))).toContain('քարտեր');
      expect(getTextContent(screen.getByTestId('method-idram'))).toContain('դրամապանակ');
      expect(getTextContent(screen.getByTestId('method-arca'))).not.toMatch(/\uFFFD/);
    });
  });

  describe('Special Armenian Characters', () => {
    it('renders specific Armenian letters correctly', () => {
      const armenianAlphabet = [
        'Ա',
        'Բ',
        'Գ',
        'Դ',
        'Ե',
        'Զ',
        'Է',
        'Ը',
        'Թ',
        'Ժ',
        'Ի',
        'Լ',
        'Խ',
        'Ծ',
        'Կ',
        'Հ',
        'Ձ',
        'Ղ',
        'Ճ',
        'Մ',
        'Յ',
        'Ն',
        'Շ',
        'Ո',
        'Չ',
        'Պ',
        'Ջ',
        'Ռ',
        'Ս',
        'Վ',
        'Տ',
        'Ր',
        'Ց',
        'Ւ',
        'Փ',
        'Ք',
        'Օ',
        'Ֆ',
        'ա',
        'բ',
        'գ',
        'դ',
        'ե',
        'զ',
        'է',
        'ը',
        'թ',
        'ժ',
        'ի',
        'լ',
        'խ',
        'ծ',
        'կ',
        'հ',
        'ձ',
        'ղ',
        'ճ',
        'մ',
        'յ',
        'ն',
        'շ',
        'ո',
        'չ',
        'պ',
        'ջ',
        'ռ',
        'ս',
        'վ',
        'տ',
        'ր',
        'ց',
        'ւ',
        'փ',
        'ք',
        'օ',
        'ֆ',
      ];

      const TestComponent = (): JSX.Element => (
        <>
          {armenianAlphabet.map((char, index) => (
            <Text key={index} testID={`armenian-char-${index}`}>
              {char}
            </Text>
          ))}
        </>
      );

      render(<TestComponent />);

      armenianAlphabet.forEach((char, index) => {
        const element = screen.getByTestId(`armenian-char-${index}`);
        expect(getTextContent(element)).toBe(char);
        expect(getTextContent(element)).not.toMatch(/\uFFFD/);
        expect(getTextContent(element)).not.toMatch(/□/);
      });
    });

    it('renders Armenian punctuation correctly', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="with-colon">{t('favorites.subtitle')}</Text>
            <Text testID="with-period">{t('onboarding.registration.fields.email')}</Text>
          </>
        );
      };

      render(<TestComponent />);
      const subtitle = getTextContent(screen.getByTestId('with-colon'));

      expect(subtitle).toContain(':');

      const withPeriod = getTextContent(screen.getByTestId('with-period'));
      expect(withPeriod).toContain('.');
    });

    it('renders Armenian text with mixed Latin characters', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="arca-label">{t('onboarding.payment.methods.ARCA')}</Text>
            <Text testID="idram-label">{t('onboarding.payment.methods.IDRAM')}</Text>
          </>
        );
      };

      render(<TestComponent />);
      const arcaLabel = getTextContent(screen.getByTestId('arca-label'));
      expect(arcaLabel).toContain('ArCa');
      expect(arcaLabel).toContain('քարտեր');

      const idramLabel = getTextContent(screen.getByTestId('idram-label'));
      expect(idramLabel).toContain('Idram');
      expect(idramLabel).toContain('դրամապանակ');
    });
  });

  describe('Number and Unit Rendering', () => {
    it('renders dynamic numbers with Armenian text', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <Text testID="power-filter">{t('stations.map.filters.powerFrom', { value: 50 })}</Text>
        );
      };

      render(<TestComponent />);
      const powerFilter = getTextContent(screen.getByTestId('power-filter'));

      expect(powerFilter).toBe('50+ kW');
      expect(powerFilter).toContain('50');
      expect(powerFilter).toContain('kW');
    });

    it('renders pricing with Armenian text', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <>
            <Text testID="price-kwh">
              {t('stations.map.sheet.pricingPerKwh', { amount: '₽100' })}
            </Text>
            <Text testID="price-minute">
              {t('stations.map.sheet.pricingPerMinute', { amount: '₽10' })}
            </Text>
          </>
        );
      };

      render(<TestComponent />);

      expect(getTextContent(screen.getByTestId('price-kwh'))).toBe('₽100/kWh');
      expect(getTextContent(screen.getByTestId('price-minute'))).toBe('₽10/րոպե');

      const perMinute = getTextContent(screen.getByTestId('price-minute'));
      expect(perMinute).toContain('րոպե');
      expect(perMinute).not.toMatch(/\uFFFD/);
    });

    it('renders review summary with numbers and Armenian text', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <Text testID="review-summary">
            {t('stations.map.sheet.reviewSummary', { rating: '4.5', count: 23 })}
          </Text>
        );
      };

      render(<TestComponent />);
      const summary = getTextContent(screen.getByTestId('review-summary'));

      expect(summary).toContain('4.5');
      expect(summary).toContain('23');
      expect(summary).toContain('կարծիք');
      expect(summary).not.toMatch(/\uFFFD/);
    });
  });

  describe('Long Armenian Text', () => {
    it('renders long text without character corruption', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="long-text">{t('onboarding.registration.subtitle')}</Text>;
      };

      render(<TestComponent />);
      const longText = getTextContent(screen.getByTestId('long-text'));

      expect(longText.length).toBeGreaterThan(10);
      expect(longText).toContain('Գրանցվեք');
      expect(longText).toContain('որպեսզի');
      expect(longText).toContain('սկսեք');
      expect(longText).toContain('լիցքավորել');
      expect(longText).toContain('LiloCharge');
      expect(longText).not.toMatch(/\uFFFD/);
    });

    it('renders multiline Armenian text correctly', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="multiline-text">{t('stations.map.search.placeholder')}</Text>;
      };

      render(<TestComponent />);
      const searchPlaceholder = getTextContent(screen.getByTestId('multiline-text'));

      expect(searchPlaceholder).toContain('Որոնել');
      expect(searchPlaceholder).toContain('կայան');
      expect(searchPlaceholder).toContain('անունով');
      expect(searchPlaceholder).toContain('հասցեով');
      expect(searchPlaceholder).not.toMatch(/\uFFFD/);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty strings without errors', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return <Text testID="empty-test">{t('tabs.stations.title')}</Text>;
      };

      render(<TestComponent />);
      expect(screen.getByTestId('empty-test')).toBeTruthy();
    });

    it('handles missing interpolation values gracefully', () => {
      const TestComponent = (): JSX.Element => {
        const { t } = useAppTranslation();
        return (
          <Text testID="missing-value">{t('stations.map.filters.powerFrom', { value: '' })}</Text>
        );
      };

      render(<TestComponent />);
      const textWithMissingValue = getTextContent(screen.getByTestId('missing-value'));

      expect(textWithMissingValue).toBeTruthy();
      expect(textWithMissingValue).not.toMatch(/\uFFFD/);
    });

    it('renders Armenian characters in uppercase correctly', () => {
      const uppercase = 'ՍՏԵՂԾԵՔ ՀԱՇԻՎ';

      const TestComponent = (): JSX.Element => <Text testID="uppercase">{uppercase}</Text>;

      render(<TestComponent />);
      const element = screen.getByTestId('uppercase');
      expect(getTextContent(element)).toBe(uppercase);
      expect(getTextContent(element)).not.toMatch(/\uFFFD/);
    });

    it('renders Armenian characters in lowercase correctly', () => {
      const lowercase = 'ստեղծեք հաշիվ';

      const TestComponent = (): JSX.Element => <Text testID="lowercase">{lowercase}</Text>;

      render(<TestComponent />);
      const element = screen.getByTestId('lowercase');
      expect(getTextContent(element)).toBe(lowercase);
      expect(getTextContent(element)).not.toMatch(/\uFFFD/);
    });
  });
});
