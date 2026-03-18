import type { ApiHealthResponse } from '@lilocharge/shared-types';
import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

const DEFAULT_SERVICE_NAME = 'lilocharge-api';

/** Controller serving API health-check probes. */
@Controller('health')
@Public()
export class HealthController {
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
}
