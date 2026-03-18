import { Global, Module } from '@nestjs/common';

import { CacheService } from './cache.service';
import { RedisService } from './redis.service';

/** Global module exposing the shared Redis service instance. */
@Global()
@Module({
  providers: [RedisService, CacheService],
  exports: [RedisService, CacheService],
})
export class RedisModule {}
