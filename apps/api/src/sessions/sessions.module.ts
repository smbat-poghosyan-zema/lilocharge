import { Module } from '@nestjs/common';

import { ConnectorsModule } from '../connectors/connectors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { SessionCostCalculatorService } from './session-cost-calculator.service';
import { SessionMonitoringGateway } from './session-monitoring.gateway';
import { SessionMonitoringService } from './session-monitoring.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/** Feature module providing charging-session lifecycle APIs and state transitions. */
@Module({
  imports: [ConnectorsModule, NotificationsModule, PrismaModule, PaymentsModule, WalletModule],
  controllers: [SessionsController],
  providers: [
    SessionCostCalculatorService,
    SessionMonitoringGateway,
    SessionMonitoringService,
    SessionsService,
  ],
  exports: [SessionCostCalculatorService, SessionMonitoringService, SessionsService],
})
export class SessionsModule {}
