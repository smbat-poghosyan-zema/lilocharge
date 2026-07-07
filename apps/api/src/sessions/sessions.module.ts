import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { ConnectorsModule } from '../connectors/connectors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OcppModule } from '../ocpp/ocpp.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { SessionCostCalculatorService } from './session-cost-calculator.service';
import { SessionMonitoringGateway } from './session-monitoring.gateway';
import { SessionMonitoringService } from './session-monitoring.service';
import { SessionSettlementService } from './session-settlement.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/** Feature module providing charging-session lifecycle APIs and state transitions. */
@Module({
  imports: [
    ConnectorsModule,
    // JwtService is used by the monitoring gateway to validate socket handshake access tokens
    // with the same secret/claims as the HTTP JwtAuthGuard (secret passed at verify time).
    JwtModule.register({}),
    NotificationsModule,
    // forwardRef breaks the OcppModule <-> SessionsModule import cycle (OCPP transactions need the
    // cost calculator while session lifecycle APIs dispatch OCPP remote commands).
    forwardRef(() => OcppModule),
    PaymentsModule,
    PrismaModule,
    WalletModule,
  ],
  controllers: [SessionsController],
  providers: [
    SessionCostCalculatorService,
    SessionMonitoringGateway,
    SessionMonitoringService,
    SessionSettlementService,
    SessionsService,
  ],
  exports: [
    SessionCostCalculatorService,
    SessionMonitoringService,
    SessionSettlementService,
    SessionsService,
  ],
})
export class SessionsModule {}
