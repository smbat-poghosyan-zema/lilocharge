import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

/**
 * Verification strategy for payment gateway webhook signatures.
 *
 * Convention: the gateway signs the callback body with HMAC-SHA256 using the shared
 * webhook secret and sends the lowercase hex digest in the `x-signature` request header.
 * Because the HTTP layer parses JSON before this code runs (no raw-body access), the MAC
 * is computed over the canonical JSON serialization of the payload — object keys sorted
 * alphabetically at every nesting level — so the digest is independent of key order.
 *
 * ArCa and Idram publish their own (different) callback signing schemes; when the real
 * contracts are wired up, adapt {@link computeSignature} (and only it) to each gateway's
 * scheme — the constant-time comparison and controller/service plumbing stay unchanged.
 */
@Injectable()
export class WebhookSignatureVerifier {
  /** Computes the expected lowercase-hex HMAC-SHA256 signature for one webhook payload. */
  public computeSignature(payload: unknown, secret: string): string {
    return createHmac('sha256', secret).update(buildCanonicalJson(payload)).digest('hex');
  }

  /** Verifies one supplied signature against the payload using a constant-time comparison. */
  public verify(input: {
    readonly payload: unknown;
    readonly secret: string;
    readonly signature: string;
  }): boolean {
    const expectedSignature = Buffer.from(this.computeSignature(input.payload, input.secret));
    const providedSignature = Buffer.from(input.signature.trim().toLowerCase());

    if (providedSignature.length !== expectedSignature.length) {
      return false;
    }

    return timingSafeEqual(providedSignature, expectedSignature);
  }
}

/** Serializes one JSON-compatible value deterministically with alphabetically sorted keys. */
function buildCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(buildCanonicalJson).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${buildCanonicalJson(record[key])}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
