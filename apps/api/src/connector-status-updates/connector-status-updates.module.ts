import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ConnectorStatusUpdatesController } from './connector-status-updates.controller';
import { ConnectorStatusUpdatesService } from './connector-status-updates.service';

/** Module providing connector status update functionality. */
@Module({
  imports: [PrismaModule],
  controllers: [ConnectorStatusUpdatesController],
  providers: [ConnectorStatusUpdatesService],
  exports: [ConnectorStatusUpdatesService],
})
export class ConnectorStatusUpdatesModule {}
