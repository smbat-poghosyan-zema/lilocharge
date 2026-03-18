import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProblemReportsController } from './problem-reports.controller';
import { ProblemReportsService } from './problem-reports.service';

/** Feature module for station problem report CRUD operations. */
@Module({
  imports: [PrismaModule, MailModule],
  controllers: [ProblemReportsController],
  providers: [ProblemReportsService],
  exports: [ProblemReportsService],
})
export class ProblemReportsModule {}
