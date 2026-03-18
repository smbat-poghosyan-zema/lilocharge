import { Tabs } from 'expo-router';

import { resolveInitialTabRoute } from '../../src/config/runtime';
import { useAppTranslation } from '../../src/i18n/use-app-translation';

/**
 * Defines the primary tab navigation for station discovery and account access.
 */
export default function TabsLayout(): JSX.Element {
  const { t } = useAppTranslation();

  return (
    <Tabs
      initialRouteName={resolveInitialTabRoute('hy')}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="stations"
        options={{
          title: t('tabs.stations.title'),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('tabs.favorites.title'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile.title'),
        }}
      />
    </Tabs>
  );
}
