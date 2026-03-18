import type { UserReviewResponse } from '@lilocharge/shared-types';

import type { CreateReviewDto } from './dto/create-review.dto';
import type { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import type { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsController } from './reviews.controller';
import type { ReviewsService } from './reviews.service';

interface ReviewsServiceMock {
  readonly createReview: jest.Mock<Promise<UserReviewResponse>, [string, CreateReviewDto]>;
  readonly deleteReview: jest.Mock<Promise<void>, [string, string]>;
  readonly getReviewsByStation: jest.Mock<
    Promise<UserReviewResponse[]>,
    [string, ListReviewsQueryDto]
  >;
  readonly getReviewsByUser: jest.Mock<
    Promise<UserReviewResponse[]>,
    [string, ListReviewsQueryDto]
  >;
  readonly updateReview: jest.Mock<Promise<UserReviewResponse>, [string, string, UpdateReviewDto]>;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';
const REVIEW_ID = '33333333-3333-3333-3333-333333333333';

/** Builds one user review response fixture for controller delegation tests. */
function buildUserReviewResponse(): UserReviewResponse {
  return {
    comment: 'Excellent charging station',
    createdAt: '2026-02-17T00:00:00.000Z',
    id: REVIEW_ID,
    photos: ['https://example.com/photo1.jpg'],
    rating: 5,
    station: {
      address: 'Հյուսիսային պողոտա 10',
      city: 'Yerevan',
      id: STATION_ID,
      name: 'Kentron Hub',
    },
    stationId: STATION_ID,
    updatedAt: '2026-02-17T00:00:00.000Z',
    userId: USER_ID,
  };
}

describe('ReviewsController', () => {
  it('delegates create, update, delete, and list review operations to reviews service methods', async () => {
    const userReview = buildUserReviewResponse();
    const reviewsServiceMock: ReviewsServiceMock = {
      createReview: jest
        .fn<Promise<UserReviewResponse>, [string, CreateReviewDto]>()
        .mockResolvedValue(userReview),
      deleteReview: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined),
      getReviewsByStation: jest
        .fn<Promise<UserReviewResponse[]>, [string, ListReviewsQueryDto]>()
        .mockResolvedValue([userReview]),
      getReviewsByUser: jest
        .fn<Promise<UserReviewResponse[]>, [string, ListReviewsQueryDto]>()
        .mockResolvedValue([userReview]),
      updateReview: jest
        .fn<Promise<UserReviewResponse>, [string, string, UpdateReviewDto]>()
        .mockResolvedValue(userReview),
    };

    const controller = new ReviewsController(reviewsServiceMock as unknown as ReviewsService);

    const createDto: CreateReviewDto = {
      photos: ['https://example.com/photo1.jpg'],
      rating: 5,
      stationId: STATION_ID,
    };

    const updateDto: UpdateReviewDto = {
      rating: 4,
    };

    const queryDto: ListReviewsQueryDto = {
      limit: 20,
      page: 1,
    };

    await expect(controller.createReview(USER_ID, createDto)).resolves.toEqual(userReview);
    await expect(controller.updateReview(USER_ID, REVIEW_ID, updateDto)).resolves.toEqual(
      userReview,
    );
    await expect(controller.deleteReview(USER_ID, REVIEW_ID)).resolves.toBeUndefined();
    await expect(controller.getReviewsByStation(STATION_ID, queryDto)).resolves.toEqual([
      userReview,
    ]);
    await expect(controller.getReviewsByUser(USER_ID, queryDto)).resolves.toEqual([userReview]);

    expect(reviewsServiceMock.createReview).toHaveBeenCalledWith(USER_ID, createDto);
    expect(reviewsServiceMock.updateReview).toHaveBeenCalledWith(USER_ID, REVIEW_ID, updateDto);
    expect(reviewsServiceMock.deleteReview).toHaveBeenCalledWith(USER_ID, REVIEW_ID);
    expect(reviewsServiceMock.getReviewsByStation).toHaveBeenCalledWith(STATION_ID, queryDto);
    expect(reviewsServiceMock.getReviewsByUser).toHaveBeenCalledWith(USER_ID, queryDto);
  });
});
