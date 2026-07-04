const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEEP_LINK_PREFIX_PATTERN = /^lilocharge:\/\//i;
const WEB_LINK_PREFIX_PATTERN = /^https?:\/\//i;

/** Parsed charging target extracted from one scanned or pasted QR payload. */
export interface ChargeQrPayload {
  readonly connectorId: string;
  readonly stationId?: string;
}

/**
 * Parses one raw QR payload into a charging target.
 *
 * Supported payload conventions:
 * - a raw connector UUID (`8f14e45f-...`),
 * - a `lilocharge://charge?connectorId=<uuid>[&stationId=<uuid>]` deep link,
 * - an `http(s)` URL carrying the same `connectorId`/`stationId` query params.
 *
 * Returns `null` when the payload cannot be interpreted as a charging target.
 */
export function parseChargeQrPayload(rawValue: string): ChargeQrPayload | null {
  const normalizedValue = rawValue.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  if (UUID_PATTERN.test(normalizedValue)) {
    return { connectorId: normalizedValue.toLowerCase() };
  }

  if (
    !DEEP_LINK_PREFIX_PATTERN.test(normalizedValue) &&
    !WEB_LINK_PREFIX_PATTERN.test(normalizedValue)
  ) {
    return null;
  }

  const queryParameters = parseQueryParameters(normalizedValue);
  const connectorId = normalizeUuidParameter(queryParameters.get('connectorId'));

  if (connectorId === null) {
    return null;
  }

  const stationId = normalizeUuidParameter(queryParameters.get('stationId'));

  return stationId === null ? { connectorId } : { connectorId, stationId };
}

/**
 * Extracts decoded query parameters from one URL-like payload string.
 */
function parseQueryParameters(value: string): ReadonlyMap<string, string> {
  const parameters = new Map<string, string>();
  const queryStartIndex = value.indexOf('?');

  if (queryStartIndex === -1) {
    return parameters;
  }

  const queryString = value.slice(queryStartIndex + 1).split('#')[0];

  for (const pair of queryString.split('&')) {
    if (pair.length === 0) {
      continue;
    }

    const separatorIndex = pair.indexOf('=');
    const rawKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const rawParameterValue = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
    const key = safeDecodeUriComponent(rawKey);
    const parameterValue = safeDecodeUriComponent(rawParameterValue);

    if (key === null || parameterValue === null || parameters.has(key)) {
      continue;
    }

    parameters.set(key, parameterValue);
  }

  return parameters;
}

/**
 * Validates one query parameter as a UUID and lowercases it, or returns null.
 */
function normalizeUuidParameter(value: string | undefined): string | null {
  const normalizedValue = value?.trim() ?? '';

  return UUID_PATTERN.test(normalizedValue) ? normalizedValue.toLowerCase() : null;
}

/**
 * Decodes one URI component without throwing on malformed escape sequences.
 */
function safeDecodeUriComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}
