import { ActivityIndicator, View } from 'react-native';

import { SUCCESS } from '../theme/colors';

/**
 * Loading fallback component shown while lazy components are being loaded.
 */
export function LazyLoadFallback(): JSX.Element {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={SUCCESS} size="large" />
    </View>
  );
}
