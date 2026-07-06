import type { UserProfileResponse, VehicleResponse } from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';

import { createProfileApi } from './profile-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const USER_PROFILE: UserProfileResponse = {
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: 'Anna Petrosyan',
  email: 'anna@example.com',
  id: USER_ID,
  language: 'hy',
  marketingNotificationsEnabled: false,
  phone: '+37477123456',
  pushNotificationsEnabled: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const VEHICLES: VehicleResponse[] = [
  {
    batteryCapacity: 77,
    connectorType: ConnectorType.CCS,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: '22222222-2222-2222-2222-222222222222',
    make: 'Kia',
    maxChargePower: 240,
    model: 'EV6',
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: USER_ID,
    year: 2024,
  },
];

describe('profile api', () => {
  it('requests the user profile through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn<Promise<UserProfileResponse>, [string]>(() => {
        return Promise.resolve(USER_PROFILE);
      }),
    };

    const profileApi = createProfileApi(apiClientMock as never);

    await expect(profileApi.getUserProfile(USER_ID)).resolves.toEqual(USER_PROFILE);
    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}`);
  });

  it('requests the user vehicles through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn<Promise<VehicleResponse[]>, [string]>(() => {
        return Promise.resolve(VEHICLES);
      }),
    };

    const profileApi = createProfileApi(apiClientMock as never);

    await expect(profileApi.getUserVehicles(USER_ID)).resolves.toEqual(VEHICLES);
    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/vehicles`);
  });

  it('patches the language preference through the typed API client', async () => {
    const apiClientMock = {
      patch: jest.fn<
        Promise<UserProfileResponse>,
        [string, { body: { language: string } }]
      >(() => {
        return Promise.resolve({ ...USER_PROFILE, language: 'en' });
      }),
    };

    const profileApi = createProfileApi(apiClientMock as never);

    await expect(profileApi.updateUserLanguage(USER_ID, 'en')).resolves.toMatchObject({
      language: 'en',
    });
    expect(apiClientMock.patch).toHaveBeenCalledWith(`/users/${USER_ID}/language`, {
      body: { language: 'en' },
    });
  });
});
