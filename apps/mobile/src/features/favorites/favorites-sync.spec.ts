import type {
  FavoriteStation,
  StationNearbyResponse,
  UserFavoriteStationResponse,
} from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';

import type { PersistedOnboardingSession } from '../onboarding/session-storage';
import type { FavoritesApi } from './favorites-api';
import { createFavoritesStorage, type FavoritesStorage } from './favorites-storage';
import { createFavoritesSync } from './favorites-sync';

const USER_ID = '99999999-9999-9999-9999-999999999999';
const LOCAL_STATION_ID = '11111111-1111-1111-1111-111111111111';
const SERVER_STATION_ID = '22222222-2222-2222-2222-222222222222';

/** Builds one nearby-station payload used to save favorites in tests. */
function buildNearbyStation(stationId: string, name = 'Arami Fast Charge'): StationNearbyResponse {
  return {
    address: 'Արամի 6',
    amenities: ['parking'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 320,
    id: stationId,
    latitude: 40.177,
    longitude: 44.511,
    maxPowerKw: 50,
    name,
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    status: StationStatus.AVAILABLE,
  };
}

/** Builds one server favorite payload for merge behavior tests. */
function buildServerFavorite(
  stationId: string,
  overrides: Partial<UserFavoriteStationResponse> = {},
): UserFavoriteStationResponse {
  const nearbyStation = buildNearbyStation(stationId, 'Server Station Name');

  return {
    createdAt: '2026-03-01T00:00:00.000Z',
    station: {
      address: nearbyStation.address,
      amenities: nearbyStation.amenities,
      city: nearbyStation.city,
      id: nearbyStation.id,
      latitude: nearbyStation.latitude,
      longitude: nearbyStation.longitude,
      name: nearbyStation.name,
      openingHours: nearbyStation.openingHours,
      operatorId: nearbyStation.operatorId,
      operatorName: nearbyStation.operatorName,
      status: nearbyStation.status,
    },
    stationId,
    userId: USER_ID,
    ...overrides,
  };
}

/** Builds an in-memory MMKV-style favorites storage instance. */
function buildInMemoryFavoritesStorage(): FavoritesStorage {
  const valueByKey = new Map<string, string>();

  return createFavoritesStorage({
    delete: (key: string): void => {
      valueByKey.delete(key);
    },
    getString: (key: string): string | undefined => {
      return valueByKey.get(key);
    },
    set: (key: string, value: string): void => {
      valueByKey.set(key, value);
    },
  });
}

interface FavoritesApiMock {
  readonly listFavorites: jest.Mock<Promise<UserFavoriteStationResponse[]>, [string]>;
  readonly removeFavorite: jest.Mock<Promise<void>, [string, string]>;
  readonly saveFavorite: jest.Mock<Promise<UserFavoriteStationResponse>, [string, string]>;
}

/** Builds a resolved favorites API mock. */
function createFavoritesApiMock(): FavoritesApiMock {
  return {
    listFavorites: jest.fn<Promise<UserFavoriteStationResponse[]>, [string]>(() => {
      return Promise.resolve([]);
    }),
    removeFavorite: jest.fn<Promise<void>, [string, string]>(() => {
      return Promise.resolve();
    }),
    saveFavorite: jest.fn<Promise<UserFavoriteStationResponse>, [string, string]>(
      (userId: string, stationId: string) => {
        return Promise.resolve(buildServerFavorite(stationId, { userId }));
      },
    ),
  };
}

/** Builds a session storage stub with a configurable persisted user id. */
function buildSessionStorageStub(userId: string | null): {
  readSession(): PersistedOnboardingSession;
} {
  return {
    readSession: (): PersistedOnboardingSession => {
      return {
        accessToken: userId === null ? null : 'access-token',
        onboardingComplete: userId !== null,
        refreshToken: userId === null ? null : 'refresh-token',
        userId,
      };
    },
  };
}

/** Lists station ids currently persisted by the provided storage. */
function listStationIds(storage: FavoritesStorage): readonly string[] {
  return storage.listFavoriteStations().map((favorite) => favorite.stationId);
}

describe('createFavoritesSync', () => {
  describe('signed-out users', () => {
    it('keeps pure local behavior on toggle without any server calls', async () => {
      const storage = buildInMemoryFavoritesStorage();
      const apiMock = createFavoritesApiMock();
      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(null),
      });

      const saveResult = await sync.toggleFavorite(buildNearbyStation(LOCAL_STATION_ID));

      expect(saveResult.status).toBe('LOCAL_ONLY');
      expect(listStationIds(storage)).toEqual([LOCAL_STATION_ID]);

      const removeResult = await sync.toggleFavorite(buildNearbyStation(LOCAL_STATION_ID));

      expect(removeResult.status).toBe('LOCAL_ONLY');
      expect(listStationIds(storage)).toEqual([]);
      expect(apiMock.saveFavorite).not.toHaveBeenCalled();
      expect(apiMock.removeFavorite).not.toHaveBeenCalled();
    });

    it('skips server refresh entirely', async () => {
      const storage = buildInMemoryFavoritesStorage();
      const apiMock = createFavoritesApiMock();
      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(null),
      });

      const result = await sync.refreshFromServer();

      expect(result.status).toBe('LOCAL_ONLY');
      expect(apiMock.listFavorites).not.toHaveBeenCalled();
    });
  });

  describe('refreshFromServer', () => {
    it('merges server favorites into local storage as a union with server winning conflicts', async () => {
      const storage = buildInMemoryFavoritesStorage();
      storage.saveFavoriteStation(buildNearbyStation(LOCAL_STATION_ID, 'Local Only Station'));
      storage.saveFavoriteStation(buildNearbyStation(SERVER_STATION_ID, 'Stale Local Name'));

      const apiMock = createFavoritesApiMock();
      apiMock.listFavorites.mockResolvedValue([buildServerFavorite(SERVER_STATION_ID)]);

      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      const result = await sync.refreshFromServer();

      expect(result.status).toBe('SYNCED');
      expect(apiMock.listFavorites).toHaveBeenCalledWith(USER_ID);

      const mergedFavorites = storage.listFavoriteStations();
      const mergedIds = mergedFavorites.map((favorite: FavoriteStation) => favorite.stationId);

      expect(mergedIds).toHaveLength(2);
      expect(mergedIds).toEqual(expect.arrayContaining([LOCAL_STATION_ID, SERVER_STATION_ID]));

      const conflictedFavorite = mergedFavorites.find(
        (favorite) => favorite.stationId === SERVER_STATION_ID,
      );

      expect(conflictedFavorite?.station.name).toBe('Server Station Name');
      expect(conflictedFavorite?.createdAt).toBe('2026-03-01T00:00:00.000Z');
    });

    it('reports an error and keeps local favorites untouched when the fetch fails', async () => {
      const storage = buildInMemoryFavoritesStorage();
      storage.saveFavoriteStation(buildNearbyStation(LOCAL_STATION_ID));

      const apiMock = createFavoritesApiMock();
      apiMock.listFavorites.mockRejectedValue(new Error('network down'));

      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      const result = await sync.refreshFromServer();

      expect(result.status).toBe('ERROR');
      expect(listStationIds(storage)).toEqual([LOCAL_STATION_ID]);
    });
  });

  describe('optimistic save and remove', () => {
    it('saves locally first and confirms with the server', async () => {
      const storage = buildInMemoryFavoritesStorage();
      const apiMock = createFavoritesApiMock();
      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      const result = await sync.saveFavorite(buildNearbyStation(LOCAL_STATION_ID));

      expect(result.status).toBe('SYNCED');
      expect(apiMock.saveFavorite).toHaveBeenCalledWith(USER_ID, LOCAL_STATION_ID);
      expect(listStationIds(storage)).toEqual([LOCAL_STATION_ID]);
    });

    it('rolls back the optimistic save when the server call fails', async () => {
      const storage = buildInMemoryFavoritesStorage();
      const apiMock = createFavoritesApiMock();
      apiMock.saveFavorite.mockRejectedValue(new Error('server rejected'));

      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      const result = await sync.saveFavorite(buildNearbyStation(LOCAL_STATION_ID));

      expect(result.status).toBe('ERROR');
      expect(listStationIds(storage)).toEqual([]);
    });

    it('rolls back the optimistic remove when the server call fails', async () => {
      const storage = buildInMemoryFavoritesStorage();
      storage.saveFavoriteStation(buildNearbyStation(LOCAL_STATION_ID));

      const apiMock = createFavoritesApiMock();
      apiMock.removeFavorite.mockRejectedValue(new Error('server rejected'));

      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      const result = await sync.removeFavorite(LOCAL_STATION_ID);

      expect(result.status).toBe('ERROR');
      expect(listStationIds(storage)).toEqual([LOCAL_STATION_ID]);
    });

    it('removes locally first and confirms with the server', async () => {
      const storage = buildInMemoryFavoritesStorage();
      storage.saveFavoriteStation(buildNearbyStation(LOCAL_STATION_ID));

      const apiMock = createFavoritesApiMock();
      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      const result = await sync.removeFavorite(LOCAL_STATION_ID);

      expect(result.status).toBe('SYNCED');
      expect(apiMock.removeFavorite).toHaveBeenCalledWith(USER_ID, LOCAL_STATION_ID);
      expect(listStationIds(storage)).toEqual([]);
    });
  });

  describe('toggleFavorite', () => {
    it('routes to save or remove based on current local membership', async () => {
      const storage = buildInMemoryFavoritesStorage();
      const apiMock = createFavoritesApiMock();
      const sync = createFavoritesSync({
        favoritesApiClient: apiMock as unknown as FavoritesApi,
        favoritesStorageClient: storage,
        sessionStorageClient: buildSessionStorageStub(USER_ID),
      });

      await sync.toggleFavorite(buildNearbyStation(LOCAL_STATION_ID));

      expect(apiMock.saveFavorite).toHaveBeenCalledTimes(1);
      expect(apiMock.removeFavorite).not.toHaveBeenCalled();

      await sync.toggleFavorite(buildNearbyStation(LOCAL_STATION_ID));

      expect(apiMock.removeFavorite).toHaveBeenCalledTimes(1);
    });
  });
});
