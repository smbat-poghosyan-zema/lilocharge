import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ConnectorsModule } from './connectors/connectors.module';
import { ConnectorStatusUpdatesModule } from './connector-status-updates/connector-status-updates.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OcppModule } from './ocpp/ocpp.module';
import { LoggerModule } from './observability/logger.module';
import { SentryModule } from './observability/sentry.module';
import { PaymentsModule } from './payments/payments.module';
import { ProblemReportsModule } from './problem-reports/problem-reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SessionsModule } from './sessions/sessions.module';
import { StationsModule } from './stations/stations.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WalletModule } from './wallet/wallet.module';

/** Root application module for the LiloCharge API service. */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    LoggerModule,
    SentryModule,
    HealthModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    PaymentsModule,
    WalletModule,
    NotificationsModule,
    SessionsModule,
    StationsModule,
    ConnectorsModule,
    ConnectorStatusUpdatesModule,
    FavoritesModule,
    ReviewsModule,
    ProblemReportsModule,
    OcppModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
