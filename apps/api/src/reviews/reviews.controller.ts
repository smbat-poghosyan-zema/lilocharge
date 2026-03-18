import type { UserReviewResponse } from '@lilocharge/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { IdorGuard } from '../auth/guards/idor.guard';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

/** Controller exposing CRUD endpoints for station reviews. */
@ApiTags('reviews')
@Controller()
@UseGuards(IdorGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** Creates a new review for a charging station. */
  @Post('users/:userId/reviews')
  public async createReview(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateReviewDto,
  ): Promise<UserReviewResponse> {
    return this.reviewsService.createReview(userId, body);
  }

  /** Updates an existing review owned by the requesting user. */
  @Patch('users/:userId/reviews/:reviewId')
  public async updateReview(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: UpdateReviewDto,
  ): Promise<UserReviewResponse> {
    return this.reviewsService.updateReview(userId, reviewId, body);
  }

  /** Deletes an existing review owned by the requesting user. */
  @Delete('users/:userId/reviews/:reviewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async deleteReview(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ): Promise<void> {
    await this.reviewsService.deleteReview(userId, reviewId);
  }

  /** Lists all reviews for a specific charging station with pagination. */
  @Get('stations/:stationId/reviews')
  public async getReviewsByStation(
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<UserReviewResponse[]> {
    return this.reviewsService.getReviewsByStation(stationId, query);
  }

  /** Lists all reviews created by a specific user with pagination. */
  @Get('users/:userId/reviews')
  public async getReviewsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<UserReviewResponse[]> {
    return this.reviewsService.getReviewsByUser(userId, query);
  }
}
