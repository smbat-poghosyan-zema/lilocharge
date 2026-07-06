import type { ApiHealthResponse } from '@lilocharge/shared-types';
import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const DEFAULT_SERVICE_NAME = 'lilocharge-api';
const READINESS_PROBE_KEY = 'health:readiness-probe';

/** Status of an individual readiness dependency check. */
export type ReadinessCheckStatus = 'up' | 'down';

/** Aggregated readiness payload covering critical infrastructure dependencies. */
export interface ApiReadinessResponse {
  readonly status: 'ok' | 'error';
  readonly checks: {
    readonly database: ReadinessCheckStatus;
    readonly redis: ReadinessCheckStatus;
  };
}

/** Controller serving API health-check probes. */
@Controller('health')
@Public()
export class HealthController {
  private readonly logger: Logger = new Logger(HealthController.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /** Returns liveness metadata for service monitoring and load balancers. */
  @Get()
  public getHealth(): ApiHealthResponse {
    return {
      status: 'ok',
      service: process.env.APP_NAME ?? DEFAULT_SERVICE_NAME,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  /**
   * Readiness probe verifying database and Redis connectivity.
   * Responds 200 when all dependencies are reachable, 503 otherwise.
   */
  @Get('ready')
  public async getReadiness(@Res() reply: FastifyReply): Promise<void> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const healthy = database === 'up' && redis === 'up';

    const body: ApiReadinessResponse = {
      status: healthy ? 'ok' : 'error',
      checks: { database, redis },
    };

    await reply.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).send(body);
  }

  /** Verifies database connectivity with a minimal round-trip query. */
  private async checkDatabase(): Promise<ReadinessCheckStatus> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error: unknown) {
      this.logger.error(`Readiness database check failed: ${resolveErrorMessage(error)}`);
      return 'down';
    }
  }

  /**
   * Verifies Redis connectivity. RedisService does not expose a raw PING command,
   * so a lightweight GET on a sentinel key exercises the connection instead.
   */
  private async checkRedis(): Promise<ReadinessCheckStatus> {
    try {
      await this.redisService.get(READINESS_PROBE_KEY);
      return 'up';
    } catch (error: unknown) {
      this.logger.error(`Readiness redis check failed: ${resolveErrorMessage(error)}`);
      return 'down';
    }
  }
}

/** Resolves log-friendly error text for unknown thrown values. */
function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
