import type { UserFavoriteStationResponse } from '@lilocharge/shared-types';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { FavoritesService } from './favorites.service';

/** Controller exposing CRUD endpoints for user favorite stations. */
@ApiTags('favorites')
@Controller('users/:userId/favorites')
@UseGuards(IdorGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  /** Lists all stations saved as favorites by the requested user id. */
  @Get()
  public async listFavorites(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserFavoriteStationResponse[]> {
    return this.favoritesService.listFavorites(userId);
  }

  /** Saves one station to the requested user's favorite list. */
  @Post(':stationId')
  public async saveFavorite(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
  ): Promise<UserFavoriteStationResponse> {
    return this.favoritesService.saveFavorite(userId, stationId);
  }

  /** Removes one station from the requested user's favorite list. */
  @Delete(':stationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async removeFavorite(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('stationId', ParseUUIDPipe) stationId: string,
  ): Promise<void> {
    await this.favoritesService.removeFavorite(userId, stationId);
  }
}
