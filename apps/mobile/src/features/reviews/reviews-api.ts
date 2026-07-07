import type {
  CreateReviewPhotoUploadRequest,
  CreateReviewPhotoUploadResponse,
  CreateReviewRequest,
  ListReviewsQueryRequest,
  ReviewPhotoContentType,
  UpdateReviewRequest,
  UserReviewResponse,
} from '@lilocharge/shared-types';

import type { ApiClient, FetchFunction } from '../../api';
import { createAuthenticatedApiClient } from '../onboarding/authenticated-api-client';

/** Typed API contract for station reviews and review-photo uploads. */
export interface ReviewsApi {
  createReview(userId: string, request: CreateReviewRequest): Promise<UserReviewResponse>;
  createReviewPhotoUpload(
    userId: string,
    request: CreateReviewPhotoUploadRequest,
  ): Promise<CreateReviewPhotoUploadResponse>;
  deleteReview(userId: string, reviewId: string): Promise<void>;
  listStationReviews(
    stationId: string,
    query?: ListReviewsQueryRequest,
  ): Promise<UserReviewResponse[]>;
  updateReview(
    userId: string,
    reviewId: string,
    request: UpdateReviewRequest,
  ): Promise<UserReviewResponse>;
}

/** Creates review API helpers backed by the shared typed ApiClient. */
export function createReviewsApi(apiClient: ApiClient): ReviewsApi {
  return {
    createReview: (userId: string, request: CreateReviewRequest): Promise<UserReviewResponse> => {
      return apiClient.post<UserReviewResponse, CreateReviewRequest>(`/users/${userId}/reviews`, {
        body: request,
      });
    },
    createReviewPhotoUpload: (
      userId: string,
      request: CreateReviewPhotoUploadRequest,
    ): Promise<CreateReviewPhotoUploadResponse> => {
      return apiClient.post<CreateReviewPhotoUploadResponse, CreateReviewPhotoUploadRequest>(
        `/users/${userId}/uploads/review-photos`,
        {
          body: request,
        },
      );
    },
    deleteReview: (userId: string, reviewId: string): Promise<void> => {
      return apiClient.delete<void>(`/users/${userId}/reviews/${reviewId}`);
    },
    listStationReviews: (
      stationId: string,
      query: ListReviewsQueryRequest = {},
    ): Promise<UserReviewResponse[]> => {
      return apiClient.get<UserReviewResponse[]>(`/stations/${stationId}/reviews`, {
        query: {
          limit: query.limit,
          page: query.page,
        },
      });
    },
    updateReview: (
      userId: string,
      reviewId: string,
      request: UpdateReviewRequest,
    ): Promise<UserReviewResponse> => {
      return apiClient.patch<UserReviewResponse, UpdateReviewRequest>(
        `/users/${userId}/reviews/${reviewId}`,
        {
          body: request,
        },
      );
    },
  };
}

/**
 * Uploads one local review photo to a presigned PUT URL with the negotiated
 * content type. Reads the local file through fetch so the raw bytes are sent.
 */
export async function uploadReviewPhoto(
  localUri: string,
  uploadUrl: string,
  contentType: ReviewPhotoContentType,
  fetchFn: FetchFunction = fetch.bind(globalThis),
): Promise<void> {
  const localFileResponse = await fetchFn(localUri);
  const photoBytes = await localFileResponse.blob();
  const uploadResponse = await fetchFn(uploadUrl, {
    body: photoBytes,
    headers: {
      'Content-Type': contentType,
    },
    method: 'PUT',
  });

  if (!uploadResponse.ok) {
    throw new Error(`Review photo upload failed with HTTP ${uploadResponse.status}`);
  }
}

/**
 * Maps one picked-asset mime type onto a supported review-photo content type,
 * defaulting to JPEG for unknown or missing values.
 */
export function resolveReviewPhotoContentType(
  mimeType: string | null | undefined,
): ReviewPhotoContentType {
  switch (mimeType?.toLowerCase()) {
    case 'image/png':
      return 'image/png';
    case 'image/webp':
      return 'image/webp';
    case 'image/jpeg':
    case 'image/jpg':
    default:
      return 'image/jpeg';
  }
}

const defaultReviewsApiClient = createAuthenticatedApiClient();

/** Default reviews API instance for station review operations. */
export const reviewsApi = createReviewsApi(defaultReviewsApiClient);
