import type { FavoriteStation } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Card } from '../../components/ui/card';
import { ScreenContainer } from '../../components/ui/screen-container';
import { EmptyState } from '../../components/ui/state-views';
import { useAppTranslation } from '../../i18n/use-app-translation';
import { favoritesStorage, type FavoritesStorage } from './favorites-storage';
import { createFavoritesSync, type FavoritesSync } from './favorites-sync';

interface FavoritesScreenProps {
  readonly favoritesStorageClient?: FavoritesStorage;
  readonly favoritesSyncClient?: FavoritesSync;
}

/**
 * Renders locally persisted favorite stations with quick remove controls,
 * synchronized with server favorites when a signed-in session exists.
 */
export function FavoritesScreen({
  favoritesStorageClient = favoritesStorage,
  favoritesSyncClient,
}: FavoritesScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const favoritesSync = useMemo<FavoritesSync>(() => {
    return favoritesSyncClient ?? createFavoritesSync({ favoritesStorageClient });
  }, [favoritesStorageClient, favoritesSyncClient]);
  const [favorites, setFavorites] = useState<readonly FavoriteStation[]>(() => {
    return favoritesStorageClient.listFavoriteStations();
  });
  const [hasSyncLoadError, setHasSyncLoadError] = useState(false);
  const [hasSyncActionError, setHasSyncActionError] = useState(false);

  useEffect(() => {
    setFavorites(favoritesStorageClient.listFavoriteStations());

    return favoritesStorageClient.subscribe(() => {
      setFavorites(favoritesStorageClient.listFavoriteStations());
    });
  }, [favoritesStorageClient]);

  useEffect(() => {
    let isMounted = true;

    void favoritesSync.refreshFromServer().then((result) => {
      if (isMounted && result.status === 'ERROR') {
        setHasSyncLoadError(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [favoritesSync]);

  /**
   * Removes one favorite optimistically and surfaces server sync failures.
   */
  const handleRemoveFavorite = async (stationId: string): Promise<void> => {
    const result = await favoritesSync.removeFavorite(stationId);

    if (result.status === 'ERROR') {
      setHasSyncActionError(true);
    }
  };

  return (
    <ScreenContainer testID="favorites-screen">
      <View className="border-b border-border bg-neutral-0 px-[18px] pb-3.5 pt-[22px]">
        <Text accessibilityRole="header" className="text-2xl font-bold text-text">
          {t('favorites.title')}
        </Text>
        <Text className="mt-1.5 text-sm text-neutral-700">{t('favorites.subtitle')}</Text>
        {hasSyncLoadError ? (
          <Text className="mt-2 text-[13px] text-danger" testID="favorites-sync-load-error">
            {t('favorites.sync.loadError')}
          </Text>
        ) : null}
        {hasSyncActionError ? (
          <Text className="mt-2 text-[13px] text-danger" testID="favorites-sync-error">
            {t('favorites.sync.error')}
          </Text>
        ) : null}
      </View>

      {favorites.length === 0 ? (
        <EmptyState message={t('favorites.empty')} testID="favorites-empty-state" />
      ) : (
        <ScrollView testID="favorites-list">
          <View className="gap-3 p-4 pb-7">
            {favorites.map((favorite) => (
              <Card
                key={favorite.stationId}
                className="p-3.5"
                testID={`favorite-card-${favorite.stationId}`}
              >
                <Text className="text-[17px] font-bold text-text">{favorite.station.name}</Text>
                <Text className="mt-1 text-sm text-text">{favorite.station.operatorName}</Text>
                <Text className="mt-1.5 text-[13px] text-neutral-700">
                  {favorite.station.address}, {favorite.station.city}
                </Text>
                <Text className="mt-2 text-[13px] font-bold text-primary">
                  {resolveStationStatusLabel(favorite.station.status, t)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={(): void => {
                    void handleRemoveFavorite(favorite.stationId);
                  }}
                  className="mt-3 self-start rounded-full bg-danger-bg px-3 py-[7px] active:opacity-75"
                  testID={`favorite-remove-${favorite.stationId}`}
                >
                  <Text className="text-xs font-bold text-danger">
                    {t('favorites.actions.remove')}
                  </Text>
                </Pressable>
              </Card>
            ))}
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

/**
 * Maps station status values to localized labels used on favorite cards.
 */
function resolveStationStatusLabel(status: StationStatus, t: (key: string) => string): string {
  switch (status) {
    case StationStatus.OCCUPIED:
      return t('stations.map.sheet.status.occupied');
    case StationStatus.OFFLINE:
      return t('stations.map.sheet.status.offline');
    case StationStatus.MAINTENANCE:
      return t('stations.map.sheet.status.maintenance');
    case StationStatus.AVAILABLE:
    default:
      return t('stations.map.sheet.status.available');
  }
}
