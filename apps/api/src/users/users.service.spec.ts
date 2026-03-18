import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Language } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

interface UserRecord {
  readonly createdAt: Date;
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly language: Language;
  readonly marketingNotificationsEnabled: boolean;
  readonly phone: string | null;
  readonly pushNotificationsEnabled: boolean;
  readonly updatedAt: Date;
}

interface PrismaUserDelegateMock {
  readonly delete: jest.Mock<Promise<UserRecord>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<UserRecord | null>, [unknown]>;
  readonly update: jest.Mock<Promise<UserRecord>, [unknown]>;
}

interface PrismaServiceMock {
  readonly user: PrismaUserDelegateMock;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Builds a complete user record fixture with optional overrides.
 */
function buildUser(overrides?: Partial<UserRecord>): UserRecord {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    createdAt: now,
    displayName: 'Անի Սարգսյան',
    email: 'ani@example.com',
    id: USER_ID,
    language: 'HY',
    marketingNotificationsEnabled: false,
    phone: '+37477123456',
    pushNotificationsEnabled: true,
    updatedAt: now,
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: PrismaServiceMock;

  beforeEach(() => {
    prismaMock = {
      user: {
        delete: jest.fn<Promise<UserRecord>, [unknown]>(),
        findUnique: jest.fn<Promise<UserRecord | null>, [unknown]>(),
        update: jest.fn<Promise<UserRecord>, [unknown]>(),
      },
    };

    service = new UsersService(prismaMock as unknown as PrismaService);
  });

  it('returns a mapped user profile response by id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser());

    const profile = await service.getProfile(USER_ID);

    expect(profile).toEqual({
      createdAt: '2026-02-17T00:00:00.000Z',
      displayName: 'Անի Սարգսյան',
      email: 'ani@example.com',
      id: USER_ID,
      language: 'hy',
      marketingNotificationsEnabled: false,
      phone: '+37477123456',
      pushNotificationsEnabled: true,
      updatedAt: '2026-02-17T00:00:00.000Z',
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
      }),
    );
  });

  it('throws not found when requested user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.getProfile(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates display name and phone through profile endpoint', async () => {
    prismaMock.user.update.mockResolvedValue(
      buildUser({
        displayName: 'Անի',
        phone: '+37477120000',
      }),
    );

    const profile = await service.updateProfile(USER_ID, {
      displayName: '  Անի  ',
      phone: '  +37477120000  ',
    });

    expect(profile.displayName).toBe('Անի');
    expect(profile.phone).toBe('+37477120000');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          displayName: 'Անի',
          phone: '+37477120000',
        },
        where: { id: USER_ID },
      }),
    );
  });

  it('rejects profile update when no updatable fields are provided', async () => {
    await expect(service.updateProfile(USER_ID, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects profile update when display name is blank after trimming', async () => {
    await expect(
      service.updateProfile(USER_ID, {
        displayName: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates language preference using supported language code', async () => {
    prismaMock.user.update.mockResolvedValue(buildUser({ language: 'RU' }));

    const profile = await service.updateLanguage(USER_ID, {
      language: 'ru',
    });

    expect(profile.language).toBe('ru');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          language: 'RU',
        },
        where: { id: USER_ID },
      }),
    );
  });

  it('updates notification preference flags independently', async () => {
    prismaMock.user.update.mockResolvedValue(
      buildUser({
        marketingNotificationsEnabled: true,
        pushNotificationsEnabled: false,
      }),
    );

    const profile = await service.updateNotificationPreferences(USER_ID, {
      marketingNotificationsEnabled: true,
      pushNotificationsEnabled: false,
    });

    expect(profile.pushNotificationsEnabled).toBe(false);
    expect(profile.marketingNotificationsEnabled).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          marketingNotificationsEnabled: true,
          pushNotificationsEnabled: false,
        },
        where: { id: USER_ID },
      }),
    );
  });

  it('rejects notification preference updates when body is empty', async () => {
    await expect(service.updateNotificationPreferences(USER_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes user record by id', async () => {
    prismaMock.user.delete.mockResolvedValue(buildUser());

    await expect(service.deleteUser(USER_ID)).resolves.toBeUndefined();
    expect(prismaMock.user.delete).toHaveBeenCalledWith({
      where: { id: USER_ID },
    });
  });
});
