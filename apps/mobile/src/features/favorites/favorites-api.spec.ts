import type { UserFavoriteStationResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';

import { createFavoritesApi } from './favorites-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';

/** Builds one user-favorite response fixture for API delegation tests. */
function buildFavoriteResponse(): UserFavoriteStationResponse {
  return {
    createdAt: '2026-02-17T00:00:00.000Z',
    station: {
      address: 'Arami 6',
      amenities: ['parking'],
      city: 'Yerevan',
      id: STATION_ID,
      latitude: 40.177,
      longitude: 44.511,
      name: 'Arami Fast Charge',
      openingHours: '24/7',
      operatorId: 'operator-1',
      operatorName: 'LiloCharge',
      status: StationStatus.AVAILABLE,
    },
    stationId: STATION_ID,
    userId: USER_ID,
  };
}

describe('favorites api', () => {
  it('requests list, save, and remove favorite station operations through the typed API client', async () => {
    const favoriteResponse = buildFavoriteResponse();
    const apiClientMock = {
      delete: jest.fn<Promise<void>, [string]>(() => {
        return Promise.resolve();
      }),
      get: jest.fn<Promise<UserFavoriteStationResponse[]>, [string]>(() => {
        return Promise.resolve([favoriteResponse]);
      }),
      post: jest.fn<Promise<UserFavoriteStationResponse>, [string, object]>(() => {
        return Promise.resolve(favoriteResponse);
      }),
    };

    const favoritesApi = createFavoritesApi(apiClientMock as never);

    await expect(favoritesApi.listFavorites(USER_ID)).resolves.toEqual([favoriteResponse]);
    await expect(favoritesApi.saveFavorite(USER_ID, STATION_ID)).resolves.toEqual(favoriteResponse);
    await expect(favoritesApi.removeFavorite(USER_ID, STATION_ID)).resolves.toBeUndefined();

    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/favorites`);
    expect(apiClientMock.post).toHaveBeenCalledWith(
      `/users/${USER_ID}/favorites/${STATION_ID}`,
      {},
    );
    expect(apiClientMock.delete).toHaveBeenCalledWith(`/users/${USER_ID}/favorites/${STATION_ID}`);
  });
});
