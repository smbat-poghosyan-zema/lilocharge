import { ServiceUnavailableException } from '@nestjs/common';

import { UploadsService } from './uploads.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const UPLOADS_ENV_KEYS = [
  'UPLOADS_S3_ENDPOINT',
  'UPLOADS_S3_REGION',
  'UPLOADS_S3_BUCKET',
  'UPLOADS_S3_ACCESS_KEY_ID',
  'UPLOADS_S3_SECRET_ACCESS_KEY',
  'UPLOADS_PUBLIC_BASE_URL',
] as const;

const KEY_PATTERN = new RegExp(
  `^review-photos/${USER_ID}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(?:jpeg|jpg|png|webp)$`,
);

/** Applies one full uploads S3 environment configuration for enabled-service tests. */
function configureUploadsEnv(overrides?: Partial<Record<string, string>>): void {
  process.env.UPLOADS_S3_ENDPOINT = 'https://minio.internal:9000';
  process.env.UPLOADS_S3_REGION = 'us-east-1';
  process.env.UPLOADS_S3_BUCKET = 'lilocharge-uploads';
  process.env.UPLOADS_S3_ACCESS_KEY_ID = 'test-access-key';
  process.env.UPLOADS_S3_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.UPLOADS_PUBLIC_BASE_URL = 'https://cdn.lilocharge.am/uploads';

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('UploadsService', () => {
  const originalEnv: Partial<Record<string, string>> = {};

  beforeEach(() => {
    for (const key of UPLOADS_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of UPLOADS_ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('when S3 configuration is missing', () => {
    it('reports the service as disabled', () => {
      const service = new UploadsService();

      expect(service.isEnabled()).toBe(false);
    });

    it('throws ServiceUnavailableException with a clear message on presign requests', () => {
      const service = new UploadsService();

      expect(() => service.createReviewPhotoUpload(USER_ID, { contentType: 'image/jpeg' })).toThrow(
        ServiceUnavailableException,
      );
      expect(() => service.createReviewPhotoUpload(USER_ID, { contentType: 'image/jpeg' })).toThrow(
        'Photo uploads are not configured on this server - S3 storage credentials are missing',
      );
    });

    it('stays disabled when only some S3 variables are configured', () => {
      configureUploadsEnv({ UPLOADS_S3_SECRET_ACCESS_KEY: undefined });

      const service = new UploadsService();

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('when S3 configuration is present', () => {
    it('reports the service as enabled', () => {
      configureUploadsEnv();

      expect(new UploadsService().isEnabled()).toBe(true);
    });

    it('presigns one review-photo PUT upload with key, public URL, and expiry', () => {
      configureUploadsEnv();
      const service = new UploadsService();
      const before = Date.now();

      const result = service.createReviewPhotoUpload(USER_ID, { contentType: 'image/jpeg' });

      expect(result.key).toMatch(KEY_PATTERN);
      expect(result.key.endsWith('.jpg')).toBe(true);
      expect(result.publicUrl).toBe(`https://cdn.lilocharge.am/uploads/${result.key}`);
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 900_000);

      const uploadUrl = new URL(result.uploadUrl);
      expect(uploadUrl.origin).toBe('https://minio.internal:9000');
      expect(uploadUrl.pathname).toBe(`/lilocharge-uploads/${result.key}`);
      expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(uploadUrl.searchParams.get('X-Amz-Credential')).toMatch(
        /^test-access-key\/\d{8}\/us-east-1\/s3\/aws4_request$/,
      );
      expect(uploadUrl.searchParams.get('X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
      expect(uploadUrl.searchParams.get('X-Amz-Expires')).toBe('900');
      // The declared content type is signed so the URL only accepts that upload type.
      expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
      expect(uploadUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('signs the content type for every whitelisted upload type', () => {
      configureUploadsEnv();
      const service = new UploadsService();

      for (const contentType of ['image/jpeg', 'image/png', 'image/webp'] as const) {
        const upload = service.createReviewPhotoUpload(USER_ID, { contentType });

        expect(new URL(upload.uploadUrl).searchParams.get('X-Amz-SignedHeaders')).toBe(
          'content-type;host',
        );
      }
    });

    it('derives extensions from each whitelisted content type', () => {
      configureUploadsEnv();
      const service = new UploadsService();

      expect(
        service.createReviewPhotoUpload(USER_ID, { contentType: 'image/png' }).key,
      ).toMatch(/\.png$/);
      expect(
        service.createReviewPhotoUpload(USER_ID, { contentType: 'image/webp' }).key,
      ).toMatch(/\.webp$/);
    });

    it('honors an explicit extension override', () => {
      configureUploadsEnv();
      const service = new UploadsService();

      const result = service.createReviewPhotoUpload(USER_ID, {
        contentType: 'image/jpeg',
        extension: 'jpeg',
      });

      expect(result.key).toMatch(/\.jpeg$/);
    });

    it('falls back to endpoint/bucket public URLs when UPLOADS_PUBLIC_BASE_URL is unset', () => {
      configureUploadsEnv({ UPLOADS_PUBLIC_BASE_URL: undefined });
      const service = new UploadsService();

      const result = service.createReviewPhotoUpload(USER_ID, { contentType: 'image/png' });

      expect(result.publicUrl).toBe(`https://minio.internal:9000/lilocharge-uploads/${result.key}`);
    });

    it('strips trailing slashes from the configured public base URL', () => {
      configureUploadsEnv({ UPLOADS_PUBLIC_BASE_URL: 'https://cdn.lilocharge.am/uploads///' });
      const service = new UploadsService();

      const result = service.createReviewPhotoUpload(USER_ID, { contentType: 'image/png' });

      expect(result.publicUrl).toBe(`https://cdn.lilocharge.am/uploads/${result.key}`);
    });
  });
});
