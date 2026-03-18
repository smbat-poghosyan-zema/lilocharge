import { ActivityIndicator, StyleSheet, View } from 'react-native';

/**
 * Loading fallback component shown while lazy components are being loaded.
 */
export function LazyLoadFallback(): JSX.Element {
  return (
    <View style={styles.container}>
      <ActivityIndicator color="#16A34A" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    flex: 1,
    justifyContent: 'center',
  },
});
