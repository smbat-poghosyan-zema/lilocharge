import type {
  CreateReviewRequest,
  ListReviewsQueryRequest,
  UpdateReviewRequest,
  UserReviewResponse,
} from '@lilocharge/shared-types';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const STATION_NOT_FOUND_MESSAGE = 'Station not found';
const REVIEW_NOT_FOUND_MESSAGE = 'Review not found';
const REVIEW_ALREADY_EXISTS_MESSAGE = 'Review already exists for this station';
const REVIEW_UPDATE_FORBIDDEN_MESSAGE = 'Cannot update review created by another user';
const REVIEW_DELETE_FORBIDDEN_MESSAGE = 'Cannot delete review created by another user';
const MAX_REVIEW_PHOTOS = 5;
const REVIEW_PHOTO_LIMIT_MESSAGE = `A review can include at most ${MAX_REVIEW_PHOTOS} photos`;
const REVIEW_PHOTO_HTTPS_MESSAGE = 'Review photo URLs must use https';

const USER_ID_SELECT = {
  id: true,
} satisfies Prisma.UserSelect;

const STATION_ID_SELECT = {
  id: true,
} satisfies Prisma.StationSelect;

const REVIEW_SELECT = {
  comment: true,
  createdAt: true,
  id: true,
  photos: true,
  rating: true,
  stationId: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.ReviewSelect;

const REVIEW_WITH_STATION_SELECT = {
  comment: true,
  createdAt: true,
  id: true,
  photos: true,
  rating: true,
  station: {
    select: {
      address: true,
      city: true,
      id: true,
      name: true,
    },
  },
  stationId: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.ReviewSelect;

type ReviewRecord = Prisma.ReviewGetPayload<{
  select: typeof REVIEW_SELECT;
}>;

type ReviewWithStationRecord = Prisma.ReviewGetPayload<{
  select: typeof REVIEW_WITH_STATION_SELECT;
}>;

/** Service responsible for review CRUD operations. */
@Injectable()
export class ReviewsService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Creates a new review for a charging station.
   * Ensures one review per user per station.
   */
  public async createReview(
    userId: string,
    data: CreateReviewRequest,
  ): Promise<UserReviewResponse> {
    assertValidReviewPhotos(data.photos);
    await this.assertUserExists(userId);
    await this.assertStationExists(data.stationId);

    const existingReview = await this.prismaService.review.findFirst({
      where: {
        stationId: data.stationId,
        userId,
      },
      select: { id: true },
    });

    if (existingReview !== null) {
      throw new BadRequestException(REVIEW_ALREADY_EXISTS_MESSAGE);
    }

    const review = await this.prismaService.review.create({
      data: {
        comment: data.comment ?? null,
        photos: data.photos ? [...data.photos] : [],
        rating: data.rating,
        stationId: data.stationId,
        userId,
      },
      select: REVIEW_WITH_STATION_SELECT,
    });

    return mapReviewWithStationRecordToResponse(review);
  }

  /** Updates an existing review owned by the requesting user. */
  public async updateReview(
    userId: string,
    reviewId: string,
    data: UpdateReviewRequest,
  ): Promise<UserReviewResponse> {
    assertValidReviewPhotos(data.photos);
    await this.assertUserExists(userId);

    const existingReview = await this.prismaService.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true },
    });

    if (existingReview === null) {
      throw new NotFoundException(REVIEW_NOT_FOUND_MESSAGE);
    }

    if (existingReview.userId !== userId) {
      throw new ForbiddenException(REVIEW_UPDATE_FORBIDDEN_MESSAGE);
    }

    const updateData: Prisma.ReviewUpdateInput = {};

    if (data.rating !== undefined) {
      updateData.rating = data.rating;
    }

    if (data.comment !== undefined) {
      updateData.comment = data.comment;
    }

    if (data.photos !== undefined) {
      updateData.photos = [...data.photos];
    }

    const review = await this.prismaService.review.update({
      where: { id: reviewId },
      data: updateData,
      select: REVIEW_WITH_STATION_SELECT,
    });

    return mapReviewWithStationRecordToResponse(review);
  }

  /** Deletes an existing review owned by the requesting user. */
  public async deleteReview(userId: string, reviewId: string): Promise<void> {
    await this.assertUserExists(userId);

    const existingReview = await this.prismaService.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true },
    });

    if (existingReview === null) {
      throw new NotFoundException(REVIEW_NOT_FOUND_MESSAGE);
    }

    if (existingReview.userId !== userId) {
      throw new ForbiddenException(REVIEW_DELETE_FORBIDDEN_MESSAGE);
    }

    await this.prismaService.review.delete({
      where: { id: reviewId },
    });
  }

  /** Lists reviews for a specific station with pagination. */
  public async getReviewsByStation(
    stationId: string,
    query: ListReviewsQueryRequest,
  ): Promise<UserReviewResponse[]> {
    await this.assertStationExists(stationId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const reviews = await this.prismaService.review.findMany({
      where: { stationId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: REVIEW_SELECT,
    });

    return reviews.map((review) => mapReviewRecordToResponse(review));
  }

  /** Lists reviews created by a specific user with pagination. */
  public async getReviewsByUser(
    userId: string,
    query: ListReviewsQueryRequest,
  ): Promise<UserReviewResponse[]> {
    await this.assertUserExists(userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const reviews = await this.prismaService.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: REVIEW_WITH_STATION_SELECT,
    });

    return reviews.map((review) => mapReviewWithStationRecordToResponse(review));
  }

  /** Ensures a user id exists before review operations are executed. */
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: USER_ID_SELECT,
    });

    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }
  }

  /** Ensures a station id exists before review operations are executed. */
  private async assertStationExists(stationId: string): Promise<void> {
    const station = await this.prismaService.station.findUnique({
      where: { id: stationId },
      select: STATION_ID_SELECT,
    });

    if (station === null) {
      throw new NotFoundException(STATION_NOT_FOUND_MESSAGE);
    }
  }
}

/**
 * Validates review photo URLs: at most 5 photos, each hosted at the configured
 * uploads public base URL (`UPLOADS_PUBLIC_BASE_URL`), or any https URL when the
 * uploads storage is not configured.
 */
function assertValidReviewPhotos(photos: readonly string[] | undefined): void {
  if (photos === undefined) {
    return;
  }

  if (photos.length > MAX_REVIEW_PHOTOS) {
    throw new BadRequestException(REVIEW_PHOTO_LIMIT_MESSAGE);
  }

  const publicBaseUrl = process.env.UPLOADS_PUBLIC_BASE_URL?.replace(/\/+$/, '');

  for (const photo of photos) {
    if (publicBaseUrl !== undefined && publicBaseUrl.length > 0) {
      if (!photo.startsWith(`${publicBaseUrl}/`)) {
        throw new BadRequestException(`Review photos must be hosted at ${publicBaseUrl}`);
      }
    } else if (!photo.startsWith('https://')) {
      throw new BadRequestException(REVIEW_PHOTO_HTTPS_MESSAGE);
    }
  }
}

/** Maps a review Prisma record to a user review response payload. */
function mapReviewRecordToResponse(review: ReviewRecord): UserReviewResponse {
  return {
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    id: review.id,
    photos: review.photos,
    rating: review.rating,
    stationId: review.stationId,
    updatedAt: review.updatedAt.toISOString(),
    userId: review.userId,
  };
}

/** Maps a review with embedded station to a user review response payload. */
function mapReviewWithStationRecordToResponse(review: ReviewWithStationRecord): UserReviewResponse {
  return {
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
    id: review.id,
    photos: review.photos,
    rating: review.rating,
    station: {
      address: review.station.address,
      city: review.station.city,
      id: review.station.id,
      name: review.station.name,
    },
    stationId: review.stationId,
    updatedAt: review.updatedAt.toISOString(),
    userId: review.userId,
  };
}
