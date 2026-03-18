import type { StationNearbyResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';

import { createFavoritesStorage } from './favorites-storage';

interface InMemoryStorageDriver {
  delete: jest.Mock<void, [string]>;
  getString: jest.Mock<string | undefined, [string]>;
  set: jest.Mock<void, [string, string]>;
}

const STATION: StationNearbyResponse = {
  address: 'Arami 6',
  amenities: ['parking'],
  city: 'Yerevan',
  connectorCount: 2,
  distanceMeters: 320,
  id: '11111111-1111-1111-1111-111111111111',
  latitude: 40.177,
  longitude: 44.511,
  maxPowerKw: 50,
  name: 'Arami Fast Charge',
  openingHours: '24/7',
  operatorId: 'operator-1',
  operatorName: 'LiloCharge',
  status: StationStatus.AVAILABLE,
};

/** Builds a fully in-memory MMKV-compatible storage driver for unit tests. */
function createInMemoryStorageDriver(initial?: string): InMemoryStorageDriver {
  let value = initial;

  return {
    delete: jest.fn<void, [string]>(() => {
      value = undefined;
    }),
    getString: jest.fn<string | undefined, [string]>(() => value),
    set: jest.fn<void, [string, string]>((_key, nextValue) => {
      value = nextValue;
    }),
  };
}

describe('favorites storage', () => {
  it('saves, lists, and removes favorite stations in local persistence', () => {
    const storageDriver = createInMemoryStorageDriver();
    const storage = createFavoritesStorage(storageDriver);

    const favoritesAfterSave = storage.saveFavoriteStation(STATION);

    expect(favoritesAfterSave).toHaveLength(1);
    expect(favoritesAfterSave[0]?.stationId).toBe(STATION.id);
    expect(storage.isFavoriteStation(STATION.id)).toBe(true);

    const favoritesAfterRemove = storage.removeFavoriteStation(STATION.id);

    expect(favoritesAfterRemove).toHaveLength(0);
    expect(storage.isFavoriteStation(STATION.id)).toBe(false);
  });

  it('normalizes malformed persisted JSON payloads to an empty favorites list', () => {
    const storageDriver = createInMemoryStorageDriver('{"invalid":true}');
    const storage = createFavoritesStorage(storageDriver);

    expect(storage.listFavoriteStations()).toEqual([]);
  });

  it('notifies subscribers when favorite-station storage changes', () => {
    const storageDriver = createInMemoryStorageDriver();
    const storage = createFavoritesStorage(storageDriver);
    const listener = jest.fn<void, []>();

    const unsubscribe = storage.subscribe(listener);

    storage.saveFavoriteStation(STATION);
    storage.removeFavoriteStation(STATION.id);
    storage.clearFavoriteStations();

    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    storage.saveFavoriteStation(STATION);

    expect(listener).toHaveBeenCalledTimes(3);
  });
});
