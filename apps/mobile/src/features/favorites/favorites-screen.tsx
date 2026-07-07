import type { FavoriteStation } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
    <View style={styles.container} testID="favorites-screen">
      <View style={styles.headerContainer}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('favorites.title')}
        </Text>
        <Text style={styles.subtitle}>{t('favorites.subtitle')}</Text>
        {hasSyncLoadError ? (
          <Text style={styles.syncErrorText} testID="favorites-sync-load-error">
            {t('favorites.sync.loadError')}
          </Text>
        ) : null}
        {hasSyncActionError ? (
          <Text style={styles.syncErrorText} testID="favorites-sync-error">
            {t('favorites.sync.error')}
          </Text>
        ) : null}
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText} testID="favorites-empty-state">
            {t('favorites.empty')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer} testID="favorites-list">
          {favorites.map((favorite) => (
            <View
              key={favorite.stationId}
              style={styles.favoriteCard}
              testID={`favorite-card-${favorite.stationId}`}
            >
              <Text style={styles.favoriteName}>{favorite.station.name}</Text>
              <Text style={styles.favoriteOperator}>{favorite.station.operatorName}</Text>
              <Text style={styles.favoriteAddress}>
                {favorite.station.address}, {favorite.station.city}
              </Text>
              <Text style={styles.favoriteStatus}>
                {resolveStationStatusLabel(favorite.station.status, t)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={(): void => {
                  void handleRemoveFavorite(favorite.stationId);
                }}
                style={({ pressed }) => {
                  return [styles.removeButton, pressed ? styles.removeButtonPressed : null];
                }}
                testID={`favorite-remove-${favorite.stationId}`}
              >
                <Text style={styles.removeButtonText}>{t('favorites.actions.remove')}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F3F4F6',
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
  },
  favoriteAddress: {
    color: '#374151',
    fontSize: 13,
    marginTop: 6,
  },
  favoriteCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  favoriteName: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  favoriteOperator: {
    color: '#1F2937',
    fontSize: 14,
    marginTop: 4,
  },
  favoriteStatus: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  listContainer: {
    gap: 12,
    padding: 16,
    paddingBottom: 28,
  },
  removeButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  removeButtonPressed: {
    opacity: 0.75,
  },
  removeButtonText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 14,
    marginTop: 6,
  },
  syncErrorText: {
    color: '#B91C1C',
    fontSize: 13,
    marginTop: 8,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
