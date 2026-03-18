import type { FavoriteStation } from '@lilocharge/shared-types';
import type { StationNearbyResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FavoritesScreen } from './favorites-screen';
import type { FavoritesStorage } from './favorites-storage';

const FAVORITE_STATION_ID = '11111111-1111-1111-1111-111111111111';

/** Builds one favorite-station fixture for favorites screen tests. */
function buildFavoriteStation(): FavoriteStation {
  return {
    createdAt: '2026-02-17T00:00:00.000Z',
    station: {
      address: 'Արամի 6',
      amenities: ['parking'],
      city: 'Yerevan',
      id: FAVORITE_STATION_ID,
      latitude: 40.177,
      longitude: 44.511,
      name: 'Arami Fast Charge',
      openingHours: '24/7',
      operatorId: 'operator-1',
      operatorName: 'LiloCharge',
      status: StationStatus.AVAILABLE,
    },
    stationId: FAVORITE_STATION_ID,
  };
}

interface FavoritesStorageMock {
  readonly clearFavoriteStations: jest.Mock<void, []>;
  readonly isFavoriteStation: jest.Mock<boolean, [string]>;
  readonly listFavoriteStations: jest.Mock<readonly FavoriteStation[], []>;
  readonly removeFavoriteStation: jest.Mock<readonly FavoriteStation[], [string]>;
  readonly saveFavoriteStation: jest.Mock<readonly FavoriteStation[], [StationNearbyResponse]>;
  readonly setFavoriteStations: jest.Mock<readonly FavoriteStation[], [readonly FavoriteStation[]]>;
  readonly subscribe: jest.Mock<() => void, [() => void]>;
}

/** Builds a favorites-storage mock with configurable favorites state snapshot. */
function createFavoritesStorageMock(favorites: readonly FavoriteStation[]): FavoritesStorageMock {
  return {
    clearFavoriteStations: jest.fn<void, []>(),
    isFavoriteStation: jest.fn<boolean, [string]>((stationId: string) => {
      return favorites.some((favorite) => favorite.stationId === stationId);
    }),
    listFavoriteStations: jest.fn<readonly FavoriteStation[], []>(() => favorites),
    removeFavoriteStation: jest.fn<readonly FavoriteStation[], [string]>((stationId: string) => {
      return favorites.filter((favorite) => favorite.stationId !== stationId);
    }),
    saveFavoriteStation: jest.fn<readonly FavoriteStation[], [StationNearbyResponse]>(),
    setFavoriteStations: jest.fn<readonly FavoriteStation[], [readonly FavoriteStation[]]>(
      (nextFavorites) => {
        return nextFavorites;
      },
    ),
    subscribe: jest.fn<() => void, [() => void]>(() => {
      return (): void => {
        return;
      };
    }),
  };
}

describe('FavoritesScreen', () => {
  it('renders empty-state text when local favorites list is empty', () => {
    const favoritesStorageMock = createFavoritesStorageMock([]);

    render(
      <FavoritesScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
      />,
    );

    expect(screen.getByRole('header', { name: 'Սիրված կայաններ' })).toBeTruthy();
    expect(screen.getByText('Դուք դեռ չեք պահպանել սիրելի կայաններ:')).toBeTruthy();
  });

  it('renders favorite cards and removes station from favorites list', () => {
    const favorite = buildFavoriteStation();
    const favoritesStorageMock = createFavoritesStorageMock([favorite]);

    render(
      <FavoritesScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
      />,
    );

    expect(screen.getByTestId(`favorite-card-${favorite.stationId}`)).toBeTruthy();
    expect(screen.getByText('Arami Fast Charge')).toBeTruthy();

    fireEvent.press(screen.getByTestId(`favorite-remove-${favorite.stationId}`));

    expect(favoritesStorageMock.removeFavoriteStation).toHaveBeenCalledWith(favorite.stationId);
  });
});
