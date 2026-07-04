import { StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '../../config/runtime';
import { useAppTranslation } from '../../i18n/use-app-translation';

const API_BASE_URL = getApiBaseUrl();

/**
 * Renders the profile landing screen.
 */
export function ProfileScreen(): JSX.Element {
  const { t } = useAppTranslation();

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('profile.title')}
      </Text>
      <Text style={styles.subtitle}>{t('profile.subtitle')}</Text>
      <Text style={styles.apiUrlLabel} testID="api-base-url">
        {t('profile.apiBaseUrl', { url: API_BASE_URL })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  apiUrlLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 20,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  subtitle: {
    color: '#374151',
    fontSize: 16,
    textAlign: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
});
