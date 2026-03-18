import type { FavoriteStation } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTranslation } from '../../i18n/use-app-translation';
import { favoritesStorage, type FavoritesStorage } from './favorites-storage';

interface FavoritesScreenProps {
  readonly favoritesStorageClient?: FavoritesStorage;
}

/**
 * Renders locally persisted favorite stations with quick remove controls.
 */
export function FavoritesScreen({
  favoritesStorageClient = favoritesStorage,
}: FavoritesScreenProps = {}): JSX.Element {
  const { t } = useAppTranslation();
  const [favorites, setFavorites] = useState<readonly FavoriteStation[]>(() => {
    return favoritesStorageClient.listFavoriteStations();
  });

  useEffect(() => {
    setFavorites(favoritesStorageClient.listFavoriteStations());

    return favoritesStorageClient.subscribe(() => {
      setFavorites(favoritesStorageClient.listFavoriteStations());
    });
  }, [favoritesStorageClient]);

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('favorites.title')}
        </Text>
        <Text style={styles.subtitle}>{t('favorites.subtitle')}</Text>
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('favorites.empty')}</Text>
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
                  favoritesStorageClient.removeFavoriteStation(favorite.stationId);
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
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
