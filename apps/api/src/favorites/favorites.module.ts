import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

/** Feature module for user favorite station persistence and retrieval. */
@Module({
  imports: [PrismaModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
