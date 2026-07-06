import type { CreateReviewPhotoUploadResponse } from '@lilocharge/shared-types';
import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { CreateReviewPhotoUploadDto } from './dto/create-review-photo-upload.dto';
import { UploadsService } from './uploads.service';

/** Controller exposing presigned direct-upload endpoints for user content. */
@ApiTags('uploads')
@Controller('users/:userId/uploads')
@UseGuards(IdorGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /** Presigns one review-photo PUT upload URL for the requested user. */
  @Post('review-photos')
  public createReviewPhotoUpload(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateReviewPhotoUploadDto,
  ): CreateReviewPhotoUploadResponse {
    return this.uploadsService.createReviewPhotoUpload(userId, body);
  }
}
