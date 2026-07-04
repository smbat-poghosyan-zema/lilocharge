import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdorGuard } from './guards/idor.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/** Feature module for OTP registration, login, and JWT token lifecycle. */
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    PrismaModule,
    RedisModule,
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, IdorGuard],
  exports: [AuthService, JwtAuthGuard, IdorGuard, JwtModule],
})
export class AuthModule {}
