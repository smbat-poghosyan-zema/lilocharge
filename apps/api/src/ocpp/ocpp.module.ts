import { forwardRef, Module } from '@nestjs/common';

import { ConnectorsModule } from '../connectors/connectors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';
import { OcppIdTagService } from './ocpp.id-tag.service';
import { OcppMeterValuesService } from './ocpp.meter-values.service';
import { OcppRemoteStartService } from './ocpp.remote-start.service';
import { OcppRemoteStopService } from './ocpp.remote-stop.service';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRoutingService } from './ocpp.routing.service';
import { OcppServerFactory } from './ocpp.server.factory';
import { OcppServerService } from './ocpp.server.service';
import { StationStatusBroadcastService } from './ocpp.status-broadcast.service';
import { OcppTransactionsService } from './ocpp.transactions.service';
import { Ocpp2RoutingService } from './ocpp2.routing.service';
import { Ocpp2TransactionsService } from './ocpp2.transactions.service';

/** Feature module providing OCPP central-system server, routing, and connection registry services. */
@Module({
  imports: [
    ConnectorsModule,
    NotificationsModule,
    PaymentsModule,
    PrismaModule,
    // forwardRef breaks the OcppModule <-> SessionsModule import cycle (see sessions.module.ts).
    forwardRef(() => SessionsModule),
  ],
  providers: [
    OcppIdTagService,
    OcppMeterValuesService,
    OcppRemoteStartService,
    OcppRemoteStopService,
    OcppServerFactory,
    OcppRegistryService,
    OcppRoutingService,
    Ocpp2RoutingService,
    Ocpp2TransactionsService,
    OcppServerService,
    StationStatusBroadcastService,
    OcppTransactionsService,
  ],
  exports: [
    OcppIdTagService,
    OcppMeterValuesService,
    OcppRemoteStartService,
    OcppRemoteStopService,
    OcppRegistryService,
    OcppRoutingService,
    Ocpp2RoutingService,
    Ocpp2TransactionsService,
    OcppServerService,
    StationStatusBroadcastService,
    OcppTransactionsService,
  ],
})
export class OcppModule {}
