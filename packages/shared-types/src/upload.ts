/** Image content types accepted for review photo uploads. */
export type ReviewPhotoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

/** File extensions accepted for review photo upload object keys. */
export type ReviewPhotoExtension = 'jpeg' | 'jpg' | 'png' | 'webp';

/** Request payload asking the API to presign one review-photo upload URL. */
export interface CreateReviewPhotoUploadRequest {
  readonly contentType: ReviewPhotoContentType;
  readonly extension?: ReviewPhotoExtension;
}

/**
 * Response payload carrying one presigned review-photo upload.
 * The client PUTs the image bytes to `uploadUrl` before `expiresAt`, then submits
 * `publicUrl` inside the review `photos` array.
 */
export interface CreateReviewPhotoUploadResponse {
  readonly expiresAt: string;
  readonly key: string;
  readonly publicUrl: string;
  readonly uploadUrl: string;
}
