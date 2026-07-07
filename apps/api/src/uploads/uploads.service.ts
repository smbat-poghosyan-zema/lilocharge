import { randomUUID } from 'node:crypto';

import type {
  CreateReviewPhotoUploadRequest,
  CreateReviewPhotoUploadResponse,
  ReviewPhotoContentType,
} from '@lilocharge/shared-types';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { presignS3Url } from './s3-presign';

const UPLOAD_URL_EXPIRES_SECONDS = 900;
const UPLOADS_DISABLED_MESSAGE =
  'Photo uploads are not configured on this server - S3 storage credentials are missing';

const CONTENT_TYPE_EXTENSIONS: Readonly<Record<ReviewPhotoContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface UploadsS3Config {
  readonly accessKeyId: string;
  readonly bucket: string;
  readonly host: string;
  readonly protocol: 'http' | 'https';
  readonly publicBaseUrl: string;
  readonly region: string;
  readonly secretAccessKey: string;
}

/**
 * Service issuing presigned S3 PUT URLs for direct client photo uploads.
 *
 * Configuration is env-gated like MailService: when the `UPLOADS_S3_*` variables are
 * missing the service stays disabled and upload endpoints answer 503. Supports any
 * S3-compatible store (AWS S3, MinIO, Cloudflare R2) via `UPLOADS_S3_ENDPOINT`
 * with path-style object addressing.
 */
@Injectable()
export class UploadsService {
  private readonly logger: Logger = new Logger(UploadsService.name);
  private readonly config: UploadsS3Config | null;

  constructor() {
    this.config = resolveUploadsS3Config();

    if (this.config === null) {
      this.logger.warn('UPLOADS_S3_* configuration missing - photo uploads are disabled');
    }
  }

  /** Returns whether presigned uploads are configured and available. */
  public isEnabled(): boolean {
    return this.config !== null;
  }

  /**
   * Presigns one review-photo PUT upload under `review-photos/{userId}/{uuid}.{ext}`
   * and returns the upload URL together with the resulting public URL.
   */
  public createReviewPhotoUpload(
    userId: string,
    request: CreateReviewPhotoUploadRequest,
  ): CreateReviewPhotoUploadResponse {
    if (this.config === null) {
      throw new ServiceUnavailableException(UPLOADS_DISABLED_MESSAGE);
    }

    const extension = request.extension ?? CONTENT_TYPE_EXTENSIONS[request.contentType];
    const key = `review-photos/${userId}/${randomUUID()}.${extension}`;
    const signedAt = new Date();

    const uploadUrl = presignS3Url({
      accessKeyId: this.config.accessKeyId,
      // Signing the content type constrains the 15-minute URL to uploads of exactly the
      // declared type; the client must send a matching Content-Type header on the PUT.
      contentType: request.contentType,
      date: signedAt,
      expiresSeconds: UPLOAD_URL_EXPIRES_SECONDS,
      host: this.config.host,
      method: 'PUT',
      path: `/${this.config.bucket}/${key}`,
      protocol: this.config.protocol,
      region: this.config.region,
      secretAccessKey: this.config.secretAccessKey,
    });

    return {
      expiresAt: new Date(signedAt.getTime() + UPLOAD_URL_EXPIRES_SECONDS * 1000).toISOString(),
      key,
      publicUrl: `${this.config.publicBaseUrl}/${key}`,
      uploadUrl,
    };
  }
}

/** Reads and validates `UPLOADS_S3_*` environment configuration, or null when unconfigured. */
function resolveUploadsS3Config(): UploadsS3Config | null {
  const endpoint = process.env.UPLOADS_S3_ENDPOINT;
  const region = process.env.UPLOADS_S3_REGION;
  const bucket = process.env.UPLOADS_S3_BUCKET;
  const accessKeyId = process.env.UPLOADS_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.UPLOADS_S3_SECRET_ACCESS_KEY;

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return null;
  }

  const protocol = endpointUrl.protocol === 'http:' ? 'http' : 'https';
  const normalizedEndpoint = `${protocol}://${endpointUrl.host}`;
  const publicBaseUrl = normalizeBaseUrl(
    process.env.UPLOADS_PUBLIC_BASE_URL ?? `${normalizedEndpoint}/${bucket}`,
  );

  return {
    accessKeyId,
    bucket,
    host: endpointUrl.host,
    protocol,
    publicBaseUrl,
    region,
    secretAccessKey,
  };
}

/** Strips trailing slashes from one base URL so joined keys never double-slash. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
