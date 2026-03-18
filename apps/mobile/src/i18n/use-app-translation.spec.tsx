import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import i18n, { DEFAULT_LANGUAGE } from './i18n';
import { useAppTranslation } from './use-app-translation';

function TranslationConsumer(): JSX.Element {
  const { t } = useAppTranslation();

  return <Text>{t('profile.title')}</Text>;
}

describe('useAppTranslation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it('returns Armenian translations from the common namespace by default', () => {
    render(<TranslationConsumer />);

    expect(screen.getByText('Անձնական հաշիվ')).toBeTruthy();
  });
});
