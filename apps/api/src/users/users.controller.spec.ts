import type { UserProfileResponse } from '@lilocharge/shared-types';

import type { UsersService } from './users.service';
import { UsersController } from './users.controller';
import type { UpdateUserLanguageDto } from './dto/update-user-language.dto';
import type { UpdateUserNotificationPreferencesDto } from './dto/update-user-notification-preferences.dto';
import type { UpdateUserProfileDto } from './dto/update-user-profile.dto';

interface UsersServiceMock {
  readonly deleteUser: jest.Mock<Promise<void>, [string]>;
  readonly getProfile: jest.Mock<Promise<UserProfileResponse>, [string]>;
  readonly updateLanguage: jest.Mock<Promise<UserProfileResponse>, [string, UpdateUserLanguageDto]>;
  readonly updateNotificationPreferences: jest.Mock<
    Promise<UserProfileResponse>,
    [string, UpdateUserNotificationPreferencesDto]
  >;
  readonly updateProfile: jest.Mock<Promise<UserProfileResponse>, [string, UpdateUserProfileDto]>;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Builds a stable profile fixture for controller delegation assertions.
 */
function buildProfileResponse(): UserProfileResponse {
  return {
    createdAt: '2026-02-17T00:00:00.000Z',
    displayName: 'Անի Սարգսյան',
    email: 'ani@example.com',
    id: USER_ID,
    language: 'hy',
    marketingNotificationsEnabled: false,
    phone: '+37477123456',
    pushNotificationsEnabled: true,
    updatedAt: '2026-02-17T00:00:00.000Z',
  };
}

describe('UsersController', () => {
  it('delegates profile operations to users service methods', async () => {
    const profileResponse = buildProfileResponse();
    const usersServiceMock: UsersServiceMock = {
      deleteUser: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      getProfile: jest
        .fn<Promise<UserProfileResponse>, [string]>()
        .mockResolvedValue(profileResponse),
      updateLanguage: jest
        .fn<Promise<UserProfileResponse>, [string, UpdateUserLanguageDto]>()
        .mockResolvedValue(profileResponse),
      updateNotificationPreferences: jest
        .fn<Promise<UserProfileResponse>, [string, UpdateUserNotificationPreferencesDto]>()
        .mockResolvedValue(profileResponse),
      updateProfile: jest
        .fn<Promise<UserProfileResponse>, [string, UpdateUserProfileDto]>()
        .mockResolvedValue(profileResponse),
    };

    const controller = new UsersController(usersServiceMock as unknown as UsersService);

    const profilePayload: UpdateUserProfileDto = {
      displayName: 'Անի',
      phone: '+37477120000',
    };
    const languagePayload: UpdateUserLanguageDto = {
      language: 'ru',
    };
    const preferencesPayload: UpdateUserNotificationPreferencesDto = {
      marketingNotificationsEnabled: true,
      pushNotificationsEnabled: false,
    };

    await expect(controller.getProfile(USER_ID)).resolves.toEqual(profileResponse);
    await expect(controller.updateProfile(USER_ID, profilePayload)).resolves.toEqual(
      profileResponse,
    );
    await expect(controller.switchLanguage(USER_ID, languagePayload)).resolves.toEqual(
      profileResponse,
    );
    await expect(
      controller.updateNotificationPreferences(USER_ID, preferencesPayload),
    ).resolves.toEqual(profileResponse);
    await expect(controller.deleteUser(USER_ID)).resolves.toBeUndefined();

    expect(usersServiceMock.getProfile).toHaveBeenCalledWith(USER_ID);
    expect(usersServiceMock.updateProfile).toHaveBeenCalledWith(USER_ID, profilePayload);
    expect(usersServiceMock.updateLanguage).toHaveBeenCalledWith(USER_ID, languagePayload);
    expect(usersServiceMock.updateNotificationPreferences).toHaveBeenCalledWith(
      USER_ID,
      preferencesPayload,
    );
    expect(usersServiceMock.deleteUser).toHaveBeenCalledWith(USER_ID);
  });
});
