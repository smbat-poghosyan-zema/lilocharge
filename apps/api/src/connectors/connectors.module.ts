import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';

/** Feature module for connector status updates and tariff-based pricing calculations. */
@Module({
  imports: [PrismaModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
