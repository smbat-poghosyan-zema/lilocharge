import type { VehicleResponse } from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

/** Controller exposing user vehicle CRUD endpoints. */
@ApiTags('vehicles')
@Controller('users/:userId/vehicles')
@UseGuards(IdorGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  /** Lists all vehicles that belong to the given user id. */
  @Get()
  public async listVehicles(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<VehicleResponse[]> {
    return this.vehiclesService.listVehicles(userId);
  }

  /** Returns a single user-owned vehicle by id. */
  @Get(':vehicleId')
  public async getVehicle(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ): Promise<VehicleResponse> {
    return this.vehiclesService.getVehicle(userId, vehicleId);
  }

  /** Creates a new vehicle profile for the given user id. */
  @Post()
  public async createVehicle(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateVehicleDto,
  ): Promise<VehicleResponse> {
    return this.vehiclesService.createVehicle(userId, dto);
  }

  /** Updates editable fields for one user-owned vehicle. */
  @Patch(':vehicleId')
  public async updateVehicle(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleResponse> {
    return this.vehiclesService.updateVehicle(userId, vehicleId, dto);
  }

  /** Deletes one user-owned vehicle profile. */
  @Delete(':vehicleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteVehicle(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ): Promise<void> {
    await this.vehiclesService.deleteVehicle(userId, vehicleId);
  }
}
