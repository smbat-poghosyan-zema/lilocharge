import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';

/** Feature module for station discovery and station detail retrieval endpoints. */
@Module({
  imports: [PrismaModule],
  controllers: [StationsController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
