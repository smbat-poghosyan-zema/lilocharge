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
          tabBarTestID: 'tab-stations',
          title: t('tabs.stations.title'),
        }}
      />
      <Tabs.Screen
        name="charge"
        options={{
          tabBarTestID: 'tab-charge',
          title: t('tabs.charge.title'),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          tabBarTestID: 'tab-favorites',
          title: t('tabs.favorites.title'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarTestID: 'tab-profile',
          title: t('tabs.profile.title'),
        }}
      />
    </Tabs>
  );
}
