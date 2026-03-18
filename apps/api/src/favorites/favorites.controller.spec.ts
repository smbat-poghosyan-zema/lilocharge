import type { UserFavoriteStationResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';

import type { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';

interface FavoritesServiceMock {
  readonly listFavorites: jest.Mock<Promise<UserFavoriteStationResponse[]>, [string]>;
  readonly removeFavorite: jest.Mock<Promise<void>, [string, string]>;
  readonly saveFavorite: jest.Mock<Promise<UserFavoriteStationResponse>, [string, string]>;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';

/** Builds one favorite station response fixture for controller delegation tests. */
function buildFavoriteStationResponse(): UserFavoriteStationResponse {
  return {
    createdAt: '2026-02-17T00:00:00.000Z',
    station: {
      address: 'Աբովյան 3',
      amenities: ['parking'],
      city: 'Yerevan',
      id: STATION_ID,
      latitude: 40.19,
      longitude: 44.51,
      name: 'Abovyan Ultra',
      openingHours: '24/7',
      operatorId: 'operator-1',
      operatorName: 'LiloCharge',
      status: StationStatus.AVAILABLE,
    },
    stationId: STATION_ID,
    userId: USER_ID,
  };
}

describe('FavoritesController', () => {
  it('delegates list, save, and remove favorite operations to favorites service methods', async () => {
    const favoriteStation = buildFavoriteStationResponse();
    const favoritesServiceMock: FavoritesServiceMock = {
      listFavorites: jest
        .fn<Promise<UserFavoriteStationResponse[]>, [string]>()
        .mockResolvedValue([favoriteStation]),
      removeFavorite: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined),
      saveFavorite: jest
        .fn<Promise<UserFavoriteStationResponse>, [string, string]>()
        .mockResolvedValue(favoriteStation),
    };

    const controller = new FavoritesController(favoritesServiceMock as unknown as FavoritesService);

    await expect(controller.listFavorites(USER_ID)).resolves.toEqual([favoriteStation]);
    await expect(controller.saveFavorite(USER_ID, STATION_ID)).resolves.toEqual(favoriteStation);
    await expect(controller.removeFavorite(USER_ID, STATION_ID)).resolves.toBeUndefined();

    expect(favoritesServiceMock.listFavorites).toHaveBeenCalledWith(USER_ID);
    expect(favoritesServiceMock.saveFavorite).toHaveBeenCalledWith(USER_ID, STATION_ID);
    expect(favoritesServiceMock.removeFavorite).toHaveBeenCalledWith(USER_ID, STATION_ID);
  });
});
