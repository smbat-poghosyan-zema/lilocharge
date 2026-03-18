import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';

interface StationSearchInputProps {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}

/**
 * Renders the station search text input and clear action for tri-lingual fuzzy search.
 */
export function StationSearchInput({ value, onChangeText }: StationSearchInputProps): JSX.Element {
  const { t } = useAppTranslation();

  /**
   * Clears the current search term and resets station search results.
   */
  const handleClearPress = (): void => {
    onChangeText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        accessibilityLabel={t('stations.map.search.label')}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('stations.map.search.placeholder')}
        placeholderTextColor="#6B7280"
        style={styles.input}
        testID="station-search-input"
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel={t('stations.map.search.clear')}
          accessibilityRole="button"
          onPress={handleClearPress}
          style={({ pressed }) => {
            return [styles.clearButton, pressed ? styles.clearButtonPressed : null];
          }}
          testID="station-search-clear-button"
        >
          <Text style={styles.clearButtonText}>{t('stations.map.search.clear')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clearButton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clearButtonPressed: {
    opacity: 0.75,
  },
  clearButtonText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
    width: '100%',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    color: '#111827',
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
