import { Module } from '@nestjs/common';

import { ConnectorsModule } from '../connectors/connectors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';
import { OcppMeterValuesService } from './ocpp.meter-values.service';
import { OcppRemoteStartService } from './ocpp.remote-start.service';
import { OcppRemoteStopService } from './ocpp.remote-stop.service';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRoutingService } from './ocpp.routing.service';
import { OcppServerFactory } from './ocpp.server.factory';
import { OcppServerService } from './ocpp.server.service';
import { StationStatusBroadcastService } from './ocpp.status-broadcast.service';
import { OcppTransactionsService } from './ocpp.transactions.service';

/** Feature module providing OCPP central-system server, routing, and connection registry services. */
@Module({
  imports: [ConnectorsModule, NotificationsModule, PaymentsModule, PrismaModule, SessionsModule],
  providers: [
    OcppMeterValuesService,
    OcppRemoteStartService,
    OcppRemoteStopService,
    OcppServerFactory,
    OcppRegistryService,
    OcppRoutingService,
    OcppServerService,
    StationStatusBroadcastService,
    OcppTransactionsService,
  ],
  exports: [
    OcppMeterValuesService,
    OcppRemoteStartService,
    OcppRemoteStopService,
    OcppRegistryService,
    OcppRoutingService,
    OcppServerService,
    StationStatusBroadcastService,
    OcppTransactionsService,
  ],
})
export class OcppModule {}
