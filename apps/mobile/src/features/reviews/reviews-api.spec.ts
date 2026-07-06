import type { UserReviewResponse } from '@lilocharge/shared-types';

import {
  createReviewsApi,
  resolveReviewPhotoContentType,
  uploadReviewPhoto,
} from './reviews-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';
const REVIEW_ID = '33333333-3333-3333-3333-333333333333';

function buildReviewResponse(overrides: Partial<UserReviewResponse> = {}): UserReviewResponse {
  return {
    comment: 'Fast charging, easy parking.',
    createdAt: '2026-07-01T10:00:00.000Z',
    id: REVIEW_ID,
    photos: [],
    rating: 5,
    stationId: STATION_ID,
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    ...overrides,
  };
}

describe('reviews api', () => {
  it('creates a review through the typed API client', async () => {
    const apiClientMock = {
      post: jest.fn(() => Promise.resolve(buildReviewResponse())),
    };

    const reviewsApi = createReviewsApi(apiClientMock as never);

    await expect(
      reviewsApi.createReview(USER_ID, {
        comment: 'Fast charging, easy parking.',
        photos: ['https://cdn.example.com/photo-1.jpg'],
        rating: 5,
        stationId: STATION_ID,
      }),
    ).resolves.toMatchObject({
      id: REVIEW_ID,
      rating: 5,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${USER_ID}/reviews`, {
      body: {
        comment: 'Fast charging, easy parking.',
        photos: ['https://cdn.example.com/photo-1.jpg'],
        rating: 5,
        stationId: STATION_ID,
      },
    });
  });

  it('updates a review through the typed API client', async () => {
    const apiClientMock = {
      patch: jest.fn(() => Promise.resolve(buildReviewResponse({ rating: 4 }))),
    };

    const reviewsApi = createReviewsApi(apiClientMock as never);

    await expect(
      reviewsApi.updateReview(USER_ID, REVIEW_ID, { rating: 4 }),
    ).resolves.toMatchObject({
      rating: 4,
    });

    expect(apiClientMock.patch).toHaveBeenCalledWith(`/users/${USER_ID}/reviews/${REVIEW_ID}`, {
      body: { rating: 4 },
    });
  });

  it('deletes a review through the typed API client', async () => {
    const apiClientMock = {
      delete: jest.fn(() => Promise.resolve(undefined)),
    };

    const reviewsApi = createReviewsApi(apiClientMock as never);

    await expect(reviewsApi.deleteReview(USER_ID, REVIEW_ID)).resolves.toBeUndefined();

    expect(apiClientMock.delete).toHaveBeenCalledWith(`/users/${USER_ID}/reviews/${REVIEW_ID}`);
  });

  it('lists station reviews with pagination options', async () => {
    const apiClientMock = {
      get: jest.fn(() => Promise.resolve([buildReviewResponse()])),
    };

    const reviewsApi = createReviewsApi(apiClientMock as never);

    await expect(
      reviewsApi.listStationReviews(STATION_ID, { limit: 10, page: 2 }),
    ).resolves.toHaveLength(1);

    expect(apiClientMock.get).toHaveBeenCalledWith(`/stations/${STATION_ID}/reviews`, {
      query: {
        limit: 10,
        page: 2,
      },
    });
  });

  it('presigns one review-photo upload through the typed API client', async () => {
    const apiClientMock = {
      post: jest.fn(() =>
        Promise.resolve({
          expiresAt: '2026-07-06T12:00:00.000Z',
          key: 'review-photos/user/photo.jpeg',
          publicUrl: 'https://cdn.example.com/review-photos/user/photo.jpeg',
          uploadUrl: 'https://storage.example.com/presigned-put',
        }),
      ),
    };

    const reviewsApi = createReviewsApi(apiClientMock as never);

    await expect(
      reviewsApi.createReviewPhotoUpload(USER_ID, { contentType: 'image/jpeg' }),
    ).resolves.toMatchObject({
      publicUrl: 'https://cdn.example.com/review-photos/user/photo.jpeg',
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${USER_ID}/uploads/review-photos`, {
      body: { contentType: 'image/jpeg' },
    });
  });
});

describe('uploadReviewPhoto', () => {
  it('reads local bytes and PUTs them to the presigned URL with the content type', async () => {
    const photoBlob = { size: 3 } as Blob;
    const fetchMock = jest.fn((input: string) => {
      if (input === 'file:///photo.jpeg') {
        return Promise.resolve({
          blob: () => Promise.resolve(photoBlob),
          ok: true,
          status: 200,
        } as unknown as Response);
      }

      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    await uploadReviewPhoto(
      'file:///photo.jpeg',
      'https://storage.example.com/presigned-put',
      'image/jpeg',
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith('file:///photo.jpeg');
    expect(fetchMock).toHaveBeenCalledWith('https://storage.example.com/presigned-put', {
      body: photoBlob,
      headers: {
        'Content-Type': 'image/jpeg',
      },
      method: 'PUT',
    });
  });

  it('throws when the presigned PUT responds with a non-2xx status', async () => {
    const fetchMock = jest.fn((input: string) => {
      if (input.startsWith('file://')) {
        return Promise.resolve({
          blob: () => Promise.resolve({} as Blob),
          ok: true,
          status: 200,
        } as unknown as Response);
      }

      return Promise.resolve({ ok: false, status: 403 } as Response);
    });

    await expect(
      uploadReviewPhoto(
        'file:///photo.jpeg',
        'https://storage.example.com/presigned-put',
        'image/jpeg',
        fetchMock,
      ),
    ).rejects.toThrow('HTTP 403');
  });
});

describe('resolveReviewPhotoContentType', () => {
  it.each([
    ['image/png', 'image/png'],
    ['image/webp', 'image/webp'],
    ['image/jpeg', 'image/jpeg'],
    ['image/jpg', 'image/jpeg'],
    ['image/heic', 'image/jpeg'],
    [null, 'image/jpeg'],
    [undefined, 'image/jpeg'],
  ])('maps %s to %s', (mimeType, expected) => {
    expect(resolveReviewPhotoContentType(mimeType)).toBe(expected);
  });
});
