import { StationStatus } from '@lilocharge/shared-types';
import { NotFoundException } from '@nestjs/common';
import type { StationStatus as PrismaStationStatus } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import { FavoritesService } from './favorites.service';

interface FavoriteStationRecord {
  readonly createdAt: Date;
  readonly station: {
    readonly address: string;
    readonly amenities: readonly string[];
    readonly city: string;
    readonly id: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly name: string;
    readonly openingHours: string | null;
    readonly operatorId: string;
    readonly operatorName: string;
    readonly status: PrismaStationStatus;
  };
  readonly stationId: string;
  readonly userId: string;
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
}

interface PrismaStationDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
}

interface PrismaFavoriteStationDelegateMock {
  readonly deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  readonly findMany: jest.Mock<Promise<FavoriteStationRecord[]>, [unknown]>;
  readonly upsert: jest.Mock<Promise<FavoriteStationRecord>, [unknown]>;
}

interface PrismaServiceMock {
  readonly favoriteStation: PrismaFavoriteStationDelegateMock;
  readonly station: PrismaStationDelegateMock;
  readonly user: PrismaUserDelegateMock;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';

/** Builds one favorite-station record fixture with optional field overrides. */
function buildFavoriteStationRecord(
  overrides?: Partial<FavoriteStationRecord>,
): FavoriteStationRecord {
  return {
    createdAt: new Date('2026-02-17T00:00:00.000Z'),
    station: {
      address: 'Հյուսիսային պողոտա 10',
      amenities: ['parking', 'cafe'],
      city: 'Yerevan',
      id: STATION_ID,
      latitude: 40.1792,
      longitude: 44.4991,
      name: 'Kentron Hub',
      openingHours: '24/7',
      operatorId: 'operator-1',
      operatorName: 'LiloCharge',
      status: 'AVAILABLE',
    },
    stationId: STATION_ID,
    userId: USER_ID,
    ...overrides,
  };
}

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prismaMock: PrismaServiceMock;

  beforeEach(() => {
    prismaMock = {
      favoriteStation: {
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
        findMany: jest.fn<Promise<FavoriteStationRecord[]>, [unknown]>(),
        upsert: jest.fn<Promise<FavoriteStationRecord>, [unknown]>(),
      },
      station: {
        findUnique: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      },
      user: {
        findUnique: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      },
    };

    service = new FavoritesService(prismaMock as unknown as PrismaService);
  });

  it('lists mapped favorite stations ordered by most recently added entries', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.favoriteStation.findMany.mockResolvedValue([buildFavoriteStationRecord()]);

    const favorites = await service.listFavorites(USER_ID);

    expect(favorites).toEqual([
      {
        createdAt: '2026-02-17T00:00:00.000Z',
        station: {
          address: 'Հյուսիսային պողոտա 10',
          amenities: ['parking', 'cafe'],
          city: 'Yerevan',
          id: STATION_ID,
          latitude: 40.1792,
          longitude: 44.4991,
          name: 'Kentron Hub',
          openingHours: '24/7',
          operatorId: 'operator-1',
          operatorName: 'LiloCharge',
          status: StationStatus.AVAILABLE,
        },
        stationId: STATION_ID,
        userId: USER_ID,
      },
    ]);
    expect(prismaMock.favoriteStation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          createdAt: 'desc',
        },
        where: {
          userId: USER_ID,
        },
      }),
    );
  });

  it('saves a favorite station via upsert and returns the mapped response payload', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.station.findUnique.mockResolvedValue({ id: STATION_ID });
    prismaMock.favoriteStation.upsert.mockResolvedValue(
      buildFavoriteStationRecord({
        station: {
          ...buildFavoriteStationRecord().station,
          status: 'OCCUPIED',
        },
      }),
    );

    const favorite = await service.saveFavorite(USER_ID, STATION_ID);

    expect(favorite.station.status).toBe(StationStatus.OCCUPIED);
    expect(prismaMock.favoriteStation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          stationId: STATION_ID,
          userId: USER_ID,
        },
        where: {
          userId_stationId: {
            stationId: STATION_ID,
            userId: USER_ID,
          },
        },
      }),
    );
  });

  it('removes an existing favorite station without failing for unknown rows', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.station.findUnique.mockResolvedValue({ id: STATION_ID });
    prismaMock.favoriteStation.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.removeFavorite(USER_ID, STATION_ID)).resolves.toBeUndefined();
    expect(prismaMock.favoriteStation.deleteMany).toHaveBeenCalledWith({
      where: {
        stationId: STATION_ID,
        userId: USER_ID,
      },
    });
  });

  it('throws not found when favorites are requested for a missing user id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(service.listFavorites(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.favoriteStation.findMany).not.toHaveBeenCalled();
  });

  it('throws not found when saving a favorite for a missing station id', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.station.findUnique.mockResolvedValue(null);

    await expect(service.saveFavorite(USER_ID, STATION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prismaMock.favoriteStation.upsert).not.toHaveBeenCalled();
  });

  it('throws not found when removing a favorite for a missing station id', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.station.findUnique.mockResolvedValue(null);

    await expect(service.removeFavorite(USER_ID, STATION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prismaMock.favoriteStation.deleteMany).not.toHaveBeenCalled();
  });
});
