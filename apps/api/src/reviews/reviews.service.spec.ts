import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from './reviews.service';

interface ReviewRecord {
  readonly comment: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly photos: readonly string[];
  readonly rating: number;
  readonly stationId: string;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface ReviewWithStationRecord {
  readonly comment: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly photos: readonly string[];
  readonly rating: number;
  readonly station: {
    readonly address: string;
    readonly city: string;
    readonly id: string;
    readonly name: string;
  };
  readonly stationId: string;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
}

interface PrismaStationDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
}

interface PrismaReviewDelegateMock {
  readonly create: jest.Mock<Promise<ReviewWithStationRecord>, [unknown]>;
  readonly delete: jest.Mock<Promise<ReviewRecord>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
  readonly findMany: jest.Mock<Promise<ReviewRecord[] | ReviewWithStationRecord[]>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<{ id: string; userId: string } | null>, [unknown]>;
  readonly update: jest.Mock<Promise<ReviewWithStationRecord>, [unknown]>;
}

interface PrismaServiceMock {
  readonly review: PrismaReviewDelegateMock;
  readonly station: PrismaStationDelegateMock;
  readonly user: PrismaUserDelegateMock;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';
const REVIEW_ID = '33333333-3333-3333-3333-333333333333';

/** Builds one review record fixture with optional field overrides. */
function buildReviewRecord(overrides?: Partial<ReviewRecord>): ReviewRecord {
  return {
    comment: 'Excellent charging station',
    createdAt: new Date('2026-02-17T00:00:00.000Z'),
    id: REVIEW_ID,
    photos: ['https://example.com/photo1.jpg'],
    rating: 5,
    stationId: STATION_ID,
    updatedAt: new Date('2026-02-17T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

/** Builds one review with station record fixture with optional field overrides. */
function buildReviewWithStationRecord(
  overrides?: Partial<ReviewWithStationRecord>,
): ReviewWithStationRecord {
  return {
    comment: 'Excellent charging station',
    createdAt: new Date('2026-02-17T00:00:00.000Z'),
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
    updatedAt: new Date('2026-02-17T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prismaMock: PrismaServiceMock;

  beforeEach(() => {
    prismaMock = {
      review: {
        create: jest.fn<Promise<ReviewWithStationRecord>, [unknown]>(),
        delete: jest.fn<Promise<ReviewRecord>, [unknown]>(),
        findFirst: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
        findMany: jest.fn<Promise<ReviewRecord[] | ReviewWithStationRecord[]>, [unknown]>(),
        findUnique: jest.fn<Promise<{ id: string; userId: string } | null>, [unknown]>(),
        update: jest.fn<Promise<ReviewWithStationRecord>, [unknown]>(),
      },
      station: {
        findUnique: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      },
      user: {
        findUnique: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      },
    };

    service = new ReviewsService(prismaMock as unknown as PrismaService);
  });

  describe('createReview', () => {
    it('creates a new review with all fields provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.station.findUnique.mockResolvedValue({ id: STATION_ID });
      prismaMock.review.findFirst.mockResolvedValue(null);
      prismaMock.review.create.mockResolvedValue(buildReviewWithStationRecord());

      const result = await service.createReview(USER_ID, {
        comment: 'Excellent charging station',
        photos: ['https://example.com/photo1.jpg'],
        rating: 5,
        stationId: STATION_ID,
      });

      expect(result).toEqual({
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
      });
    });

    it('throws NotFoundException when user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(USER_ID, {
          rating: 5,
          stationId: STATION_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when station does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.station.findUnique.mockResolvedValue(null);

      await expect(
        service.createReview(USER_ID, {
          rating: 5,
          stationId: STATION_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when review already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.station.findUnique.mockResolvedValue({ id: STATION_ID });
      prismaMock.review.findFirst.mockResolvedValue({ id: REVIEW_ID });

      await expect(
        service.createReview(USER_ID, {
          rating: 5,
          stationId: STATION_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateReview', () => {
    it('updates an existing review successfully', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findUnique.mockResolvedValue({ id: REVIEW_ID, userId: USER_ID });
      prismaMock.review.update.mockResolvedValue(
        buildReviewWithStationRecord({ rating: 4, comment: 'Updated comment' }),
      );

      const result = await service.updateReview(USER_ID, REVIEW_ID, {
        comment: 'Updated comment',
        rating: 4,
      });

      expect(result.rating).toBe(4);
      expect(result.comment).toBe('Updated comment');
    });

    it('throws NotFoundException when review does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findUnique.mockResolvedValue(null);

      await expect(service.updateReview(USER_ID, REVIEW_ID, { rating: 4 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user does not own the review', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        userId: 'another-user-id',
      });

      await expect(service.updateReview(USER_ID, REVIEW_ID, { rating: 4 })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteReview', () => {
    it('deletes an existing review successfully', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findUnique.mockResolvedValue({ id: REVIEW_ID, userId: USER_ID });
      prismaMock.review.delete.mockResolvedValue(buildReviewRecord());

      await service.deleteReview(USER_ID, REVIEW_ID);

      expect(prismaMock.review.delete).toHaveBeenCalledWith({
        where: { id: REVIEW_ID },
      });
    });

    it('throws NotFoundException when review does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findUnique.mockResolvedValue(null);

      await expect(service.deleteReview(USER_ID, REVIEW_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the review', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        userId: 'another-user-id',
      });

      await expect(service.deleteReview(USER_ID, REVIEW_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReviewsByStation', () => {
    it('returns paginated reviews for a station', async () => {
      prismaMock.station.findUnique.mockResolvedValue({ id: STATION_ID });
      prismaMock.review.findMany.mockResolvedValue([buildReviewRecord()]);

      const result = await service.getReviewsByStation(STATION_ID, { limit: 20, page: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.stationId).toBe(STATION_ID);
    });

    it('throws NotFoundException when station does not exist', async () => {
      prismaMock.station.findUnique.mockResolvedValue(null);

      await expect(service.getReviewsByStation(STATION_ID, { limit: 20, page: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getReviewsByUser', () => {
    it('returns paginated reviews for a user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.review.findMany.mockResolvedValue([buildReviewWithStationRecord()]);

      const result = await service.getReviewsByUser(USER_ID, { limit: 20, page: 1 });

      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe(USER_ID);
    });

    it('throws NotFoundException when user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getReviewsByUser(USER_ID, { limit: 20, page: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
