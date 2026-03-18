import type { SessionHistoryResponse, SessionResponse } from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { GetSessionHistoryDto } from './dto/get-session-history.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { SessionsService } from './sessions.service';

/** Controller exposing charging-session lifecycle endpoints for user-owned sessions. */
@ApiTags('sessions')
@Controller('users/:userId/sessions')
@UseGuards(IdorGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Creates one new pending session for the requested user id. */
  @Post()
  public async createSession(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionResponse> {
    return this.sessionsService.createSession(userId, dto);
  }

  /** Retrieves paginated session history for the requested user id with optional filters. */
  @Get()
  public async getSessionHistory(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: GetSessionHistoryDto,
  ): Promise<SessionHistoryResponse> {
    return this.sessionsService.getSessionHistory(userId, query);
  }

  /** Retrieves a single session by id for the requested user id. */
  @Get(':sessionId')
  public async getSessionById(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionResponse> {
    return this.sessionsService.getSessionById(userId, sessionId);
  }

  /** Generates and downloads a PDF receipt for a completed session. */
  @Get(':sessionId/receipt')
  public async getSessionReceipt(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<StreamableFile> {
    return this.sessionsService.generateSessionReceipt(userId, sessionId);
  }

  /** Starts one session lifecycle for the requested user and session id. */
  @Post(':sessionId/start')
  public async startSession(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: StartSessionDto,
  ): Promise<SessionResponse> {
    return this.sessionsService.startSession(userId, sessionId, dto);
  }

  /** Stops one active session lifecycle for the requested user and session id. */
  @Post(':sessionId/stop')
  public async stopSession(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: StopSessionDto,
  ): Promise<SessionResponse> {
    return this.sessionsService.stopSession(userId, sessionId, dto);
  }
}
