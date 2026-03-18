/**
 * Extracts a user identifier from the JWT `sub` claim in an access token.
 */
export function extractUserIdFromAccessToken(accessToken: string): string | null {
  const [, payloadSegment] = accessToken.split('.');

  if (!payloadSegment) {
    return null;
  }

  const payloadText = decodeBase64UrlPayload(payloadSegment);
  if (payloadText === null) {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(payloadText) as unknown;

    if (typeof parsedPayload !== 'object' || parsedPayload === null) {
      return null;
    }

    const candidate = parsedPayload as Record<string, unknown>;
    return typeof candidate.sub === 'string' ? candidate.sub : null;
  } catch {
    return null;
  }
}

/**
 * Decodes a base64url-encoded JWT payload segment into a UTF-8 string.
 */
function decodeBase64UrlPayload(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

    return atob(padded);
  } catch {
    return null;
  }
}
