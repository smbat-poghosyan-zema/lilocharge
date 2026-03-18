import { Global, Module } from '@nestjs/common';

import { LoggerModule } from './logger.module';
import { SentryService } from './sentry.service';

/** Global module providing Sentry error tracking integration. */
@Global()
@Module({
  imports: [LoggerModule],
  providers: [SentryService],
  exports: [SentryService],
})
export class SentryModule {}
