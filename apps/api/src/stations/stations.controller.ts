import type { StationDetailResponse, StationNearbyResponse } from '@lilocharge/shared-types';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { NearbyStationsQueryDto } from './dto/nearby-stations-query.dto';
import { SearchStationsQueryDto } from './dto/search-stations-query.dto';
import { StationDetailQueryDto } from './dto/station-detail-query.dto';
import { StationsService } from './stations.service';

/** Controller exposing station discovery and station detail endpoints. */
@ApiTags('stations')
@Controller('stations')
@Public()
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  /** Returns nearby stations around a lat/lng point within a configurable radius. */
  @Get('nearby')
  public async findNearbyStations(
    @Query() query: NearbyStationsQueryDto,
  ): Promise<StationNearbyResponse[]> {
    return this.stationsService.findNearbyStations(query);
  }

  /** Returns stations matching a fuzzy tri-lingual query against station name and address fields. */
  @Get('search')
  public async searchStations(
    @Query() query: SearchStationsQueryDto,
  ): Promise<StationNearbyResponse[]> {
    return this.stationsService.searchStations(query);
  }

  /** Returns one station detail payload including connectors, pricing, and review aggregates. */
  @Get(':id')
  public async getStationDetail(
    @Param('id', ParseUUIDPipe) stationId: string,
    @Query() query: StationDetailQueryDto,
  ): Promise<StationDetailResponse> {
    return this.stationsService.getStationDetail(stationId, query);
  }
}
