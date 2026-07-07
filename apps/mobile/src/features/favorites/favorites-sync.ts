import type {
  FavoriteStation,
  StationNearbyResponse,
  UserFavoriteStationResponse,
} from '@lilocharge/shared-types';

import { onboardingSessionStorage, type SessionStorage } from '../onboarding/session-storage';
import { favoritesApi, type FavoritesApi } from './favorites-api';
import { favoritesStorage, type FavoritesStorage } from './favorites-storage';

/**
 * Outcome of one favorites sync operation.
 *
 * - `LOCAL_ONLY`: no persisted user session, only local MMKV state was touched.
 * - `SYNCED`: local state and the server agree after the operation.
 * - `ERROR`: the server call failed; local optimistic changes were rolled back.
 */
export type FavoritesSyncStatus = 'ERROR' | 'LOCAL_ONLY' | 'SYNCED';

/** Result payload returned by every favorites sync operation. */
export interface FavoritesSyncResult {
  readonly status: FavoritesSyncStatus;
}

/** Contract for server-backed favorite-station synchronization. */
export interface FavoritesSync {
  /** Fetches server favorites and merges them into local storage (server wins). */
  refreshFromServer(): Promise<FavoritesSyncResult>;
  /** Removes a favorite locally (optimistic) and on the server, rolling back on failure. */
  removeFavorite(stationId: string): Promise<FavoritesSyncResult>;
  /** Saves a favorite locally (optimistic) and on the server, rolling back on failure. */
  saveFavorite(station: StationNearbyResponse): Promise<FavoritesSyncResult>;
  /** Saves or removes a favorite based on current local membership. */
  toggleFavorite(station: StationNearbyResponse): Promise<FavoritesSyncResult>;
}

/** Injectable collaborators for favorites synchronization. */
export interface FavoritesSyncDependencies {
  readonly favoritesApiClient?: FavoritesApi;
  readonly favoritesStorageClient?: FavoritesStorage;
  readonly sessionStorageClient?: Pick<SessionStorage, 'readSession'>;
}

/**
 * Creates a favorites sync service that keeps MMKV-local favorites and the
 * `/users/:userId/favorites` server state aligned.
 *
 * Signed-out users (no persisted userId) keep pure local behavior: every
 * operation succeeds locally and reports `LOCAL_ONLY` without network calls.
 */
export function createFavoritesSync({
  favoritesApiClient = favoritesApi,
  favoritesStorageClient = favoritesStorage,
  sessionStorageClient = onboardingSessionStorage,
}: FavoritesSyncDependencies = {}): FavoritesSync {
  /**
   * Reads the persisted user id, or null when the user is signed out.
   */
  const readUserId = (): string | null => {
    return sessionStorageClient.readSession().userId;
  };

  const saveFavorite = async (station: StationNearbyResponse): Promise<FavoritesSyncResult> => {
    const snapshot = favoritesStorageClient.listFavoriteStations();

    favoritesStorageClient.saveFavoriteStation(station);

    const userId = readUserId();

    if (userId === null) {
      return { status: 'LOCAL_ONLY' };
    }

    try {
      await favoritesApiClient.saveFavorite(userId, station.id);

      return { status: 'SYNCED' };
    } catch {
      favoritesStorageClient.setFavoriteStations(snapshot);

      return { status: 'ERROR' };
    }
  };

  const removeFavorite = async (stationId: string): Promise<FavoritesSyncResult> => {
    const snapshot = favoritesStorageClient.listFavoriteStations();

    favoritesStorageClient.removeFavoriteStation(stationId);

    const userId = readUserId();

    if (userId === null) {
      return { status: 'LOCAL_ONLY' };
    }

    try {
      await favoritesApiClient.removeFavorite(userId, stationId);

      return { status: 'SYNCED' };
    } catch {
      favoritesStorageClient.setFavoriteStations(snapshot);

      return { status: 'ERROR' };
    }
  };

  return {
    refreshFromServer: async (): Promise<FavoritesSyncResult> => {
      const userId = readUserId();

      if (userId === null) {
        return { status: 'LOCAL_ONLY' };
      }

      try {
        const serverFavorites = await favoritesApiClient.listFavorites(userId);
        const mergedFavorites = mergeFavorites(
          serverFavorites,
          favoritesStorageClient.listFavoriteStations(),
        );

        favoritesStorageClient.setFavoriteStations(mergedFavorites);

        return { status: 'SYNCED' };
      } catch {
        return { status: 'ERROR' };
      }
    },

    removeFavorite,

    saveFavorite,

    toggleFavorite: (station: StationNearbyResponse): Promise<FavoritesSyncResult> => {
      if (favoritesStorageClient.isFavoriteStation(station.id)) {
        return removeFavorite(station.id);
      }

      return saveFavorite(station);
    },
  };
}

/** Shared app-wide favorites sync singleton bound to default storage/API/session. */
export const favoritesSync = createFavoritesSync();

/**
 * Merges server and local favorites as a union keyed by station id.
 *
 * Server entries win on conflicts; local-only entries are kept so favorites
 * saved while offline or signed out are not silently dropped. The merged list
 * is ordered newest-first to match local save behavior.
 */
function mergeFavorites(
  serverFavorites: readonly UserFavoriteStationResponse[],
  localFavorites: readonly FavoriteStation[],
): readonly FavoriteStation[] {
  const favoritesByStationId = new Map<string, FavoriteStation>();

  for (const localFavorite of localFavorites) {
    favoritesByStationId.set(localFavorite.stationId, localFavorite);
  }

  for (const serverFavorite of serverFavorites) {
    favoritesByStationId.set(serverFavorite.stationId, {
      createdAt: serverFavorite.createdAt,
      station: serverFavorite.station,
      stationId: serverFavorite.stationId,
    });
  }

  return Array.from(favoritesByStationId.values()).sort((leftFavorite, rightFavorite) => {
    return rightFavorite.createdAt.localeCompare(leftFavorite.createdAt);
  });
}
