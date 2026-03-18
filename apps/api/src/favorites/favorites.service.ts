import type { UserFavoriteStationResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StationStatus as PrismaStationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const STATION_NOT_FOUND_MESSAGE = 'Station not found';

const USER_ID_SELECT = {
  id: true,
} satisfies Prisma.UserSelect;

const STATION_ID_SELECT = {
  id: true,
} satisfies Prisma.StationSelect;

const FAVORITE_STATION_SELECT = {
  createdAt: true,
  station: {
    select: {
      address: true,
      amenities: true,
      city: true,
      id: true,
      latitude: true,
      longitude: true,
      name: true,
      openingHours: true,
      operatorId: true,
      operatorName: true,
      status: true,
    },
  },
  stationId: true,
  userId: true,
} satisfies Prisma.FavoriteStationSelect;

type FavoriteStationRecord = Prisma.FavoriteStationGetPayload<{
  select: typeof FAVORITE_STATION_SELECT;
}>;

/** Service responsible for user favorite station save/list/remove operations. */
@Injectable()
export class FavoritesService {
  constructor(private readonly prismaService: PrismaService) {}

  /** Lists a user's favorite stations in reverse chronological order. */
  public async listFavorites(userId: string): Promise<UserFavoriteStationResponse[]> {
    await this.assertUserExists(userId);

    const favorites = await this.prismaService.favoriteStation.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc',
      },
      select: FAVORITE_STATION_SELECT,
    });

    return favorites.map((favorite) => mapFavoriteStationRecordToResponse(favorite));
  }

  /** Saves one station to a user's favorites with upsert semantics. */
  public async saveFavorite(
    userId: string,
    stationId: string,
  ): Promise<UserFavoriteStationResponse> {
    await this.assertUserExists(userId);
    await this.assertStationExists(stationId);

    const favorite = await this.prismaService.favoriteStation.upsert({
      where: {
        userId_stationId: {
          stationId,
          userId,
        },
      },
      create: {
        stationId,
        userId,
      },
      update: {},
      select: FAVORITE_STATION_SELECT,
    });

    return mapFavoriteStationRecordToResponse(favorite);
  }

  /** Removes one station from a user's favorites list. */
  public async removeFavorite(userId: string, stationId: string): Promise<void> {
    await this.assertUserExists(userId);
    await this.assertStationExists(stationId);

    await this.prismaService.favoriteStation.deleteMany({
      where: {
        stationId,
        userId,
      },
    });
  }

  /** Ensures a user id exists before favorites operations are executed. */
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: USER_ID_SELECT,
    });

    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }
  }

  /** Ensures a station id exists before favorites operations are executed. */
  private async assertStationExists(stationId: string): Promise<void> {
    const station = await this.prismaService.station.findUnique({
      where: { id: stationId },
      select: STATION_ID_SELECT,
    });

    if (station === null) {
      throw new NotFoundException(STATION_NOT_FOUND_MESSAGE);
    }
  }
}

/** Maps Prisma station status values to the shared station status enum. */
function mapPrismaStationStatusToSharedEnum(status: PrismaStationStatus): StationStatus {
  switch (status) {
    case PrismaStationStatus.OCCUPIED:
      return StationStatus.OCCUPIED;
    case PrismaStationStatus.OFFLINE:
      return StationStatus.OFFLINE;
    case PrismaStationStatus.MAINTENANCE:
      return StationStatus.MAINTENANCE;
    case PrismaStationStatus.AVAILABLE:
    default:
      return StationStatus.AVAILABLE;
  }
}

/** Maps a selected favorite-station Prisma row into a shared response payload. */
function mapFavoriteStationRecordToResponse(
  favorite: FavoriteStationRecord,
): UserFavoriteStationResponse {
  return {
    createdAt: favorite.createdAt.toISOString(),
    station: {
      address: favorite.station.address,
      amenities: favorite.station.amenities,
      city: favorite.station.city,
      id: favorite.station.id,
      latitude: favorite.station.latitude,
      longitude: favorite.station.longitude,
      name: favorite.station.name,
      openingHours: favorite.station.openingHours,
      operatorId: favorite.station.operatorId,
      operatorName: favorite.station.operatorName,
      status: mapPrismaStationStatusToSharedEnum(favorite.station.status),
    },
    stationId: favorite.stationId,
    userId: favorite.userId,
  };
}
