import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** Feature module for station review CRUD operations. */
@Module({
  imports: [PrismaModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
