import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTranslation } from '../i18n/use-app-translation';

/**
 * Renders a persistent banner whenever the device reports no network connectivity.
 *
 * Subscribes to NetInfo connectivity events for the component lifetime; NetInfo invokes
 * the listener immediately with the current state, so no separate initial fetch is needed.
 */
export function OfflineBanner(): JSX.Element | null {
  const { t } = useAppTranslation();
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    return NetInfo.addEventListener((state: NetInfoState): void => {
      setIsOffline(state.isConnected === false);
    });
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <View accessibilityRole="alert" style={styles.container} testID="offline-banner">
      <Text style={styles.text}>{t('offline.banner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#B91C1C',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
