import type { FavoriteStation } from '@lilocharge/shared-types';
import type { StationNearbyResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { FavoritesScreen } from './favorites-screen';
import type { FavoritesStorage } from './favorites-storage';
import type { FavoritesSync, FavoritesSyncResult, FavoritesSyncStatus } from './favorites-sync';

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

interface FavoritesSyncMock {
  readonly refreshFromServer: jest.Mock<Promise<FavoritesSyncResult>, []>;
  readonly removeFavorite: jest.Mock<Promise<FavoritesSyncResult>, [string]>;
  readonly saveFavorite: jest.Mock<Promise<FavoritesSyncResult>, [StationNearbyResponse]>;
  readonly toggleFavorite: jest.Mock<Promise<FavoritesSyncResult>, [StationNearbyResponse]>;
}

/** Builds a favorites-sync mock with configurable operation outcomes. */
function createFavoritesSyncMock(
  statuses: {
    readonly refreshStatus?: FavoritesSyncStatus;
    readonly removeStatus?: FavoritesSyncStatus;
  } = {},
): FavoritesSyncMock {
  const refreshStatus = statuses.refreshStatus ?? 'SYNCED';
  const removeStatus = statuses.removeStatus ?? 'SYNCED';

  return {
    refreshFromServer: jest.fn<Promise<FavoritesSyncResult>, []>(() => {
      return Promise.resolve({ status: refreshStatus });
    }),
    removeFavorite: jest.fn<Promise<FavoritesSyncResult>, [string]>(() => {
      return Promise.resolve({ status: removeStatus });
    }),
    saveFavorite: jest.fn<Promise<FavoritesSyncResult>, [StationNearbyResponse]>(() => {
      return Promise.resolve({ status: 'SYNCED' });
    }),
    toggleFavorite: jest.fn<Promise<FavoritesSyncResult>, [StationNearbyResponse]>(() => {
      return Promise.resolve({ status: 'SYNCED' });
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

  it('refreshes favorites from the server on mount through the sync client', async () => {
    const favoritesStorageMock = createFavoritesStorageMock([]);
    const favoritesSyncMock = createFavoritesSyncMock();

    render(
      <FavoritesScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
        favoritesSyncClient={favoritesSyncMock as unknown as FavoritesSync}
      />,
    );

    await waitFor(() => {
      expect(favoritesSyncMock.refreshFromServer).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('favorites-sync-load-error')).toBeNull();
  });

  it('shows a localized load error when the initial server refresh fails', async () => {
    const favoritesStorageMock = createFavoritesStorageMock([]);
    const favoritesSyncMock = createFavoritesSyncMock({ refreshStatus: 'ERROR' });

    render(
      <FavoritesScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
        favoritesSyncClient={favoritesSyncMock as unknown as FavoritesSync}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('favorites-sync-load-error')).toBeTruthy();
    });
    expect(
      screen.getByText('Չհաջողվեց բեռնել սիրված կայանները սերվերից. ցուցադրվում են այս սարքում պահպանվածները:'),
    ).toBeTruthy();
  });

  it('routes removal through the sync client and shows a localized error when it fails', async () => {
    const favorite = buildFavoriteStation();
    const favoritesStorageMock = createFavoritesStorageMock([favorite]);
    const favoritesSyncMock = createFavoritesSyncMock({ removeStatus: 'ERROR' });

    render(
      <FavoritesScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
        favoritesSyncClient={favoritesSyncMock as unknown as FavoritesSync}
      />,
    );

    fireEvent.press(screen.getByTestId(`favorite-remove-${favorite.stationId}`));

    expect(favoritesSyncMock.removeFavorite).toHaveBeenCalledWith(favorite.stationId);

    await waitFor(() => {
      expect(screen.getByTestId('favorites-sync-error')).toBeTruthy();
    });
    expect(
      screen.getByText('Չհաջողվեց թարմացնել սիրված կայանները սերվերում. փոփոխությունը չեղարկվեց:'),
    ).toBeTruthy();
  });
});
