import { presignS3Url } from './s3-presign';

describe('presignS3Url', () => {
  /**
   * Known-answer test pinned to the canonical AWS Signature Version 4 presigned-URL
   * example from the S3 API reference ("Authenticating Requests: Using Query
   * Parameters"), also mirrored in many SDK test suites.
   *
   * Inputs (verbatim from the AWS documentation example):
   * - method:       GET
   * - host:         examplebucket.s3.amazonaws.com
   * - path:         /test.txt
   * - region:       us-east-1
   * - access key:   AKIAIOSFODNN7EXAMPLE
   * - secret key:   wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   * - date:         2013-05-24T00:00:00Z (X-Amz-Date=20130524T000000Z)
   * - expires:      86400 seconds
   * - signed headers: host, payload: UNSIGNED-PAYLOAD
   *
   * Documented expected signature:
   * aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404
   */
  it('reproduces the documented AWS SigV4 presigned GET example signature exactly', () => {
    const url = presignS3Url({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      date: new Date('2013-05-24T00:00:00.000Z'),
      expiresSeconds: 86400,
      host: 'examplebucket.s3.amazonaws.com',
      method: 'GET',
      path: '/test.txt',
      protocol: 'https',
      region: 'us-east-1',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    });

    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z' +
        '&X-Amz-Expires=86400' +
        '&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('produces deterministic signatures for identical PUT inputs', () => {
    const input = {
      accessKeyId: 'minio-access-key',
      date: new Date('2026-07-06T12:00:00.000Z'),
      expiresSeconds: 900,
      host: 'minio.internal:9000',
      method: 'PUT' as const,
      path: '/lilocharge-uploads/review-photos/user-1/photo.jpg',
      protocol: 'http' as const,
      region: 'us-east-1',
      secretAccessKey: 'minio-secret-key',
    };

    expect(presignS3Url(input)).toBe(presignS3Url(input));
  });

  it('changes the signature when the object path changes', () => {
    const baseInput = {
      accessKeyId: 'minio-access-key',
      date: new Date('2026-07-06T12:00:00.000Z'),
      expiresSeconds: 900,
      host: 'minio.internal:9000',
      method: 'PUT' as const,
      path: '/bucket/a.jpg',
      protocol: 'https' as const,
      region: 'eu-central-1',
      secretAccessKey: 'minio-secret-key',
    };

    const firstSignature = extractSignature(presignS3Url(baseInput));
    const secondSignature = extractSignature(presignS3Url({ ...baseInput, path: '/bucket/b.jpg' }));

    expect(firstSignature).toMatch(/^[0-9a-f]{64}$/);
    expect(secondSignature).toMatch(/^[0-9a-f]{64}$/);
    expect(firstSignature).not.toBe(secondSignature);
  });

  it('percent-encodes reserved characters in path segments without encoding separators', () => {
    const url = presignS3Url({
      accessKeyId: 'key',
      date: new Date('2026-07-06T12:00:00.000Z'),
      expiresSeconds: 900,
      host: 'storage.example.com',
      method: 'PUT',
      path: '/bucket/review photos/img (1)+*.jpg',
      protocol: 'https',
      region: 'us-east-1',
      secretAccessKey: 'secret',
    });

    expect(url).toContain('/bucket/review%20photos/img%20%281%29%2B%2A.jpg?');
  });
});

/** Extracts the X-Amz-Signature value from one presigned URL. */
function extractSignature(url: string): string {
  return new URL(url).searchParams.get('X-Amz-Signature') ?? '';
}
