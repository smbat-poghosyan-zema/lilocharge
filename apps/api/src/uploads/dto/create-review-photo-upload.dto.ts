import type {
  CreateReviewPhotoUploadRequest,
  ReviewPhotoContentType,
  ReviewPhotoExtension,
} from '@lilocharge/shared-types';
import { IsIn, IsOptional } from 'class-validator';

/** Image content types accepted for review photo uploads. */
export const REVIEW_PHOTO_CONTENT_TYPES: readonly ReviewPhotoContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** File extensions accepted for review photo upload object keys. */
export const REVIEW_PHOTO_EXTENSIONS: readonly ReviewPhotoExtension[] = [
  'jpeg',
  'jpg',
  'png',
  'webp',
];

/** DTO requesting one presigned review-photo upload URL. */
export class CreateReviewPhotoUploadDto implements CreateReviewPhotoUploadRequest {
  @IsIn(REVIEW_PHOTO_CONTENT_TYPES)
  public contentType!: ReviewPhotoContentType;

  @IsOptional()
  @IsIn(REVIEW_PHOTO_EXTENSIONS)
  public extension?: ReviewPhotoExtension;
}
