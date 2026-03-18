import type {
  ConnectorStatusUpdateResponse,
  MostConfidentStatusResponse,
} from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { ConnectorStatusUpdatesService } from './connector-status-updates.service';
import { CreateConnectorStatusUpdateDto } from './dto/create-connector-status-update.dto';
import { ListConnectorStatusUpdatesQueryDto } from './dto/list-connector-status-updates-query.dto';

/** Controller exposing endpoints for community-reported connector status updates. */
@ApiTags('connector-status-updates')
@Controller()
@UseGuards(IdorGuard)
export class ConnectorStatusUpdatesController {
  constructor(private readonly statusUpdatesService: ConnectorStatusUpdatesService) {}

  /** Creates a new connector status update reported by a user. */
  @Post('users/:userId/connector-status-updates')
  public async createStatusUpdate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateConnectorStatusUpdateDto,
  ): Promise<ConnectorStatusUpdateResponse> {
    return this.statusUpdatesService.createStatusUpdate(userId, body);
  }

  /** Lists connector status updates with optional filtering by connector or user. */
  @Get('connector-status-updates')
  public async getStatusUpdates(
    @Query() query: ListConnectorStatusUpdatesQueryDto,
  ): Promise<ConnectorStatusUpdateResponse[]> {
    return this.statusUpdatesService.getStatusUpdates(query);
  }

  /** Gets the most confident status update for a specific connector. */
  @Get('connectors/:connectorId/most-confident-status')
  public async getMostConfidentStatus(
    @Param('connectorId', ParseUUIDPipe) connectorId: string,
  ): Promise<MostConfidentStatusResponse | null> {
    return this.statusUpdatesService.getMostConfidentStatus(connectorId);
  }
}
