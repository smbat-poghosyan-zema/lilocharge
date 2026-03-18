import type {
  ConnectorPricingCalculationResponse,
  StationConnectorResponse,
} from '@lilocharge/shared-types';
import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CalculateConnectorPricingDto } from './dto/calculate-connector-pricing.dto';
import { UpdateConnectorStatusDto } from './dto/update-connector-status.dto';
import { ConnectorsService } from './connectors.service';

/** Controller exposing connector status-update and pricing-calculation endpoints. */
@ApiTags('connectors')
@Controller('connectors')
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  /** Updates a connector's latest status and status timestamp. */
  @Patch(':connectorId/status')
  public async updateConnectorStatus(
    @Param('connectorId', ParseUUIDPipe) connectorId: string,
    @Body() dto: UpdateConnectorStatusDto,
  ): Promise<StationConnectorResponse> {
    return this.connectorsService.updateConnectorStatus(connectorId, dto);
  }

  /** Calculates tariff-based pricing for projected connector usage values. */
  @Post(':connectorId/pricing/calculate')
  public async calculatePricing(
    @Param('connectorId', ParseUUIDPipe) connectorId: string,
    @Body() dto: CalculateConnectorPricingDto,
  ): Promise<ConnectorPricingCalculationResponse> {
    return this.connectorsService.calculatePricing(connectorId, dto);
  }
}
