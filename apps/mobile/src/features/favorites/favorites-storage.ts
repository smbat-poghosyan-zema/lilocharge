import type {
  FavoriteStation,
  FavoriteStationSummary,
  StationNearbyResponse,
} from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { MMKV } from 'react-native-mmkv';

const FAVORITE_STATIONS_STORAGE_KEY = 'favorites.stations.v1';

interface MmkvStorageDriver {
  delete(key: string): void;
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** Listener invoked whenever favorite-station storage is mutated. */
export type FavoritesChangeListener = () => void;

/** Contract for favorite-station local persistence operations. */
export interface FavoritesStorage {
  clearFavoriteStations(): void;
  isFavoriteStation(stationId: string): boolean;
  listFavoriteStations(): readonly FavoriteStation[];
  removeFavoriteStation(stationId: string): readonly FavoriteStation[];
  saveFavoriteStation(station: StationNearbyResponse): readonly FavoriteStation[];
  setFavoriteStations(favorites: readonly FavoriteStation[]): readonly FavoriteStation[];
  subscribe(listener: FavoritesChangeListener): () => void;
}

/**
 * Creates an MMKV-backed favorite-station storage adapter.
 */
export function createFavoritesStorage(driver: MmkvStorageDriver): FavoritesStorage {
  const listeners = new Set<FavoritesChangeListener>();

  /**
   * Reads and validates favorite-station records from persisted JSON state.
   */
  const readFavorites = (): FavoriteStation[] => {
    const rawValue = driver.getString(FAVORITE_STATIONS_STORAGE_KEY);

    if (rawValue === undefined) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;

      return normalizeFavoriteStations(parsed);
    } catch {
      return [];
    }
  };

  /**
   * Writes favorite-station records and notifies subscribers.
   */
  const writeFavorites = (favorites: readonly FavoriteStation[]): FavoriteStation[] => {
    const normalizedFavorites = [...favorites];

    if (normalizedFavorites.length === 0) {
      driver.delete(FAVORITE_STATIONS_STORAGE_KEY);
    } else {
      driver.set(FAVORITE_STATIONS_STORAGE_KEY, JSON.stringify(normalizedFavorites));
    }

    emitChange(listeners);

    return normalizedFavorites;
  };

  return {
    clearFavoriteStations: (): void => {
      driver.delete(FAVORITE_STATIONS_STORAGE_KEY);
      emitChange(listeners);
    },

    isFavoriteStation: (stationId: string): boolean => {
      return readFavorites().some((favorite) => favorite.stationId === stationId);
    },

    listFavoriteStations: (): readonly FavoriteStation[] => {
      return readFavorites();
    },

    removeFavoriteStation: (stationId: string): readonly FavoriteStation[] => {
      const favorites = readFavorites();
      const nextFavorites = favorites.filter((favorite) => favorite.stationId !== stationId);

      return writeFavorites(nextFavorites);
    },

    saveFavoriteStation: (station: StationNearbyResponse): readonly FavoriteStation[] => {
      const favorites = readFavorites();
      const existingFavorite = favorites.find((favorite) => favorite.stationId === station.id);
      const nextFavorite: FavoriteStation = {
        createdAt: existingFavorite?.createdAt ?? new Date().toISOString(),
        station: mapNearbyStationToFavoriteSummary(station),
        stationId: station.id,
      };
      const nextFavorites = [
        nextFavorite,
        ...favorites.filter((favorite) => favorite.stationId !== station.id),
      ];

      return writeFavorites(nextFavorites);
    },

    setFavoriteStations: (favorites: readonly FavoriteStation[]): readonly FavoriteStation[] => {
      return writeFavorites(normalizeFavoriteStations(favorites));
    },

    subscribe: (listener: FavoritesChangeListener): (() => void) => {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

const defaultFavoritesMmkvStorage = new MMKV({
  id: 'lilocharge-favorites',
});

/** Shared app-wide favorite-station storage singleton. */
export const favoritesStorage = createFavoritesStorage(defaultFavoritesMmkvStorage);

/**
 * Emits a single change event to all active storage subscribers.
 */
function emitChange(listeners: ReadonlySet<FavoritesChangeListener>): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Converts runtime JSON data into validated favorite-station records.
 */
function normalizeFavoriteStations(value: unknown): FavoriteStation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const favorites: FavoriteStation[] = [];

  for (const entry of value) {
    if (isFavoriteStation(entry)) {
      favorites.push(entry);
    }
  }

  return favorites;
}

/**
 * Converts a nearby station payload into a favorite-station summary shape.
 */
function mapNearbyStationToFavoriteSummary(station: StationNearbyResponse): FavoriteStationSummary {
  return {
    address: station.address,
    amenities: station.amenities,
    city: station.city,
    id: station.id,
    latitude: station.latitude,
    longitude: station.longitude,
    name: station.name,
    openingHours: station.openingHours,
    operatorId: station.operatorId,
    operatorName: station.operatorName,
    status: station.status,
  };
}

/**
 * Type guard that validates the favorite-station summary payload.
 */
function isFavoriteStationSummary(value: unknown): value is FavoriteStationSummary {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.address !== 'string' ||
    !Array.isArray(value.amenities) ||
    !value.amenities.every((amenity) => typeof amenity === 'string') ||
    typeof value.city !== 'string' ||
    typeof value.id !== 'string' ||
    typeof value.latitude !== 'number' ||
    typeof value.longitude !== 'number' ||
    typeof value.name !== 'string' ||
    (value.openingHours !== null && typeof value.openingHours !== 'string') ||
    typeof value.operatorId !== 'string' ||
    typeof value.operatorName !== 'string' ||
    !isStationStatusValue(value.status)
  ) {
    return false;
  }

  return true;
}

/**
 * Type guard that validates the full favorite-station persistence payload.
 */
function isFavoriteStation(value: unknown): value is FavoriteStation {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.createdAt === 'string' &&
    typeof value.stationId === 'string' &&
    isFavoriteStationSummary(value.station)
  );
}

/**
 * Type guard that validates an object-like unknown value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Checks whether a runtime value is a valid StationStatus enum value.
 */
function isStationStatusValue(value: unknown): value is StationStatus {
  return (
    value === StationStatus.AVAILABLE ||
    value === StationStatus.OCCUPIED ||
    value === StationStatus.OFFLINE ||
    value === StationStatus.MAINTENANCE
  );
}
