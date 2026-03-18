import type { ProblemReportResponse } from '@lilocharge/shared-types';
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
import { CreateProblemReportDto } from './dto/create-problem-report.dto';
import { ListProblemReportsQueryDto } from './dto/list-problem-reports-query.dto';
import { ProblemReportsService } from './problem-reports.service';

/** Controller exposing CRUD endpoints for station problem reports. */
@ApiTags('problem-reports')
@Controller()
@UseGuards(IdorGuard)
export class ProblemReportsController {
  constructor(private readonly problemReportsService: ProblemReportsService) {}

  /** Creates a new problem report for a charging station. */
  @Post('users/:userId/problem-reports')
  public async createProblemReport(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateProblemReportDto,
  ): Promise<ProblemReportResponse> {
    return this.problemReportsService.createProblemReport(userId, body);
  }

  /** Lists all problem reports for a specific charging station with pagination. */
  @Get('stations/:stationId/problem-reports')
  public async getProblemReportsByStation(
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Query() query: ListProblemReportsQueryDto,
  ): Promise<ProblemReportResponse[]> {
    return this.problemReportsService.getProblemReportsByStation(stationId, query);
  }

  /** Lists all problem reports created by a specific user with pagination. */
  @Get('users/:userId/problem-reports')
  public async getProblemReportsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListProblemReportsQueryDto,
  ): Promise<ProblemReportResponse[]> {
    return this.problemReportsService.getProblemReportsByUser(userId, query);
  }
}
