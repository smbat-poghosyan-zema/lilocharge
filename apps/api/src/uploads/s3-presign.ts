import { createHash, createHmac } from 'node:crypto';

const AWS_SIGNING_ALGORITHM = 'AWS4-HMAC-SHA256';
const S3_SERVICE_NAME = 's3';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const SIGNED_HEADERS = 'host';

/** Input describing one S3 request to presign with AWS Signature Version 4 query parameters. */
export interface PresignS3UrlInput {
  readonly accessKeyId: string;
  /** Signing timestamp; the URL is valid from this instant for `expiresSeconds`. */
  readonly date: Date;
  readonly expiresSeconds: number;
  /** Host header value, including a non-default port when present (e.g. `minio.local:9000`). */
  readonly host: string;
  readonly method: 'DELETE' | 'GET' | 'HEAD' | 'PUT';
  /** Absolute, un-encoded object path (e.g. `/bucket/review-photos/user/photo.jpg`). */
  readonly path: string;
  readonly protocol: 'http' | 'https';
  readonly region: string;
  readonly secretAccessKey: string;
}

/**
 * Presigns one S3 request using the AWS Signature Version 4 query-parameter scheme
 * (`X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`,
 * `X-Amz-SignedHeaders=host`, `X-Amz-Signature`) with an `UNSIGNED-PAYLOAD` content hash.
 *
 * Implemented with node:crypto only (no AWS SDK) and validated against the canonical
 * AWS documentation presigned-GET vector in `s3-presign.spec.ts`. Works with any
 * S3-compatible endpoint (AWS, MinIO, Cloudflare R2) using path-style addressing.
 */
export function presignS3Url(input: PresignS3UrlInput): string {
  const amzDate = formatAmzDate(input.date);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/${S3_SERVICE_NAME}/aws4_request`;
  const canonicalPath = encodeCanonicalPath(input.path);

  const canonicalQuery = [
    `X-Amz-Algorithm=${AWS_SIGNING_ALGORITHM}`,
    `X-Amz-Credential=${uriEncode(`${input.accessKeyId}/${credentialScope}`)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${input.expiresSeconds}`,
    `X-Amz-SignedHeaders=${SIGNED_HEADERS}`,
  ].join('&');

  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    `host:${input.host}`,
    '',
    SIGNED_HEADERS,
    UNSIGNED_PAYLOAD,
  ].join('\n');

  const stringToSign = [
    AWS_SIGNING_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = hmacSha256Hex(
    deriveSigningKey(input.secretAccessKey, dateStamp, input.region),
    stringToSign,
  );

  return `${input.protocol}://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Derives the SigV4 signing key via the HMAC-SHA256 chain
 * `HMAC(HMAC(HMAC(HMAC("AWS4" + secret, date), region), "s3"), "aws4_request")`.
 */
function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmacSha256(Buffer.from(`AWS4${secretAccessKey}`, 'utf8'), dateStamp);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, S3_SERVICE_NAME);

  return hmacSha256(serviceKey, 'aws4_request');
}

/** Formats one date as the compact ISO 8601 form required by SigV4 (e.g. `20130524T000000Z`). */
function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** URI-encodes each segment of one absolute path per the SigV4 canonical URI rules. */
function encodeCanonicalPath(path: string): string {
  const absolutePath = path.startsWith('/') ? path : `/${path}`;

  return absolutePath
    .split('/')
    .map((segment) => uriEncode(segment))
    .join('/');
}

/**
 * URI-encodes one value per RFC 3986 as required by SigV4: every character except
 * `A-Za-z0-9`, `-`, `.`, `_`, and `~` is percent-encoded with uppercase hex digits.
 */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Computes one lowercase hex SHA-256 digest of UTF-8 text. */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Computes one raw HMAC-SHA256 digest of UTF-8 text with a binary key. */
function hmacSha256(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

/** Computes one lowercase hex HMAC-SHA256 digest of UTF-8 text with a binary key. */
function hmacSha256Hex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}
