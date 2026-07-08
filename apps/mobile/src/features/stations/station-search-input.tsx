import { Pressable, Text, TextInput, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { NEUTRAL_500 } from '../../theme/colors';

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
    <View className="mb-2 w-full flex-row items-center">
      <TextInput
        accessibilityLabel={t('stations.map.search.label')}
        autoCapitalize="none"
        autoCorrect={false}
        className="flex-1 rounded-md border border-border bg-neutral-0/95 px-3 py-[9px] text-sm text-text"
        placeholder={t('stations.map.search.placeholder')}
        placeholderTextColor={NEUTRAL_500}
        testID="station-search-input"
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel={t('stations.map.search.clear')}
          accessibilityRole="button"
          className="ml-2 rounded-full bg-neutral-200 px-2.5 py-[7px] active:opacity-75"
          onPress={handleClearPress}
          testID="station-search-clear-button"
        >
          <Text className="text-xs font-bold text-text">{t('stations.map.search.clear')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
