import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** Feature module exposing service health-check endpoints. */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
