import { createHash, timingSafeEqual } from 'node:crypto';

import { DEFAULT_OCPP_AUTH_MODE, OCPP_AUTH_MODES } from './ocpp.constants';

/** Charge-point authentication mode applied during WebSocket handshakes. */
export type OcppAuthMode = (typeof OCPP_AUTH_MODES)[number];

/** Resolved charge-point authentication policy applied to every OCPP handshake. */
export interface OcppAuthConfig {
  /** Identities allowed to connect when `mode` is `allowlist`. */
  readonly allowedIdentities: ReadonlySet<string>;
  /** Identity-to-secret map used for HTTP Basic checks when `mode` is `basic`. */
  readonly identitySecrets: ReadonlyMap<string, Buffer>;
  readonly mode: OcppAuthMode;
}

/** Result of evaluating one charge-point handshake against the configured auth policy. */
export type OcppHandshakeAuthDecision =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: string };

/** Environment variables consumed by the OCPP charge-point authentication policy. */
export interface OcppAuthEnvironment {
  readonly OCPP_ALLOWED_IDENTITIES?: string;
  readonly OCPP_AUTH_MODE?: string;
  readonly OCPP_IDENTITY_SECRETS?: string;
}

const REJECT_REASON = 'Unauthorized charge point';

/**
 * Resolves the charge-point authentication policy from environment variables.
 *
 * Fails fast (throws) on unknown modes, on `allowlist` mode without a usable allowlist, and on
 * `basic` mode without a valid identity-to-secret JSON map, so misconfigured deployments do not
 * silently fall back to an open server.
 */
export function resolveOcppAuthConfig(environment: OcppAuthEnvironment): OcppAuthConfig {
  const mode = resolveOcppAuthMode(environment.OCPP_AUTH_MODE);

  if (mode === 'allowlist') {
    const allowedIdentities = parseAllowedIdentities(environment.OCPP_ALLOWED_IDENTITIES);

    if (allowedIdentities.size === 0) {
      throw new Error(
        'OCPP_AUTH_MODE=allowlist requires at least one identity in OCPP_ALLOWED_IDENTITIES',
      );
    }

    return {
      allowedIdentities,
      identitySecrets: new Map<string, Buffer>(),
      mode,
    };
  }

  if (mode === 'basic') {
    const identitySecrets = parseIdentitySecrets(environment.OCPP_IDENTITY_SECRETS);

    if (identitySecrets.size === 0) {
      throw new Error(
        'OCPP_AUTH_MODE=basic requires a non-empty identity-to-secret JSON map in OCPP_IDENTITY_SECRETS',
      );
    }

    return {
      allowedIdentities: new Set<string>(),
      identitySecrets,
      mode,
    };
  }

  return {
    allowedIdentities: new Set<string>(),
    identitySecrets: new Map<string, Buffer>(),
    mode,
  };
}

/**
 * Evaluates one handshake against the resolved authentication policy.
 *
 * For `basic` mode, `password` is the value already extracted by `ocpp-rpc` from the HTTP Basic
 * `Authorization` header; the library only populates it when the Basic username equals the
 * charge-point identity, which enforces the OCPP 1.6 security profile 1 username rule.
 */
export function evaluateChargePointAuth(
  config: OcppAuthConfig,
  identity: string,
  password: Buffer | undefined,
): OcppHandshakeAuthDecision {
  switch (config.mode) {
    case 'open':
      return { accepted: true };
    case 'allowlist':
      if (config.allowedIdentities.has(identity)) {
        return { accepted: true };
      }

      return { accepted: false, reason: REJECT_REASON };
    case 'basic': {
      const expectedSecret = config.identitySecrets.get(identity);

      if (expectedSecret === undefined || password === undefined) {
        return { accepted: false, reason: REJECT_REASON };
      }

      if (!isSecretMatch(expectedSecret, password)) {
        return { accepted: false, reason: REJECT_REASON };
      }

      return { accepted: true };
    }
  }
}

/** Resolves the configured auth mode, defaulting to `open` and rejecting unknown values. */
export function resolveOcppAuthMode(rawMode: string | undefined): OcppAuthMode {
  const normalizedMode = rawMode?.trim().toLowerCase();

  if (normalizedMode === undefined || normalizedMode.length === 0) {
    return DEFAULT_OCPP_AUTH_MODE;
  }

  if (!OCPP_AUTH_MODES.includes(normalizedMode as OcppAuthMode)) {
    throw new Error(
      `Invalid OCPP_AUTH_MODE '${normalizedMode}'; expected one of: ${OCPP_AUTH_MODES.join(', ')}`,
    );
  }

  return normalizedMode as OcppAuthMode;
}

/** Parses one comma-separated identity allowlist into a trimmed, de-duplicated set. */
export function parseAllowedIdentities(rawAllowlist: string | undefined): ReadonlySet<string> {
  if (rawAllowlist === undefined) {
    return new Set<string>();
  }

  const identities = rawAllowlist
    .split(',')
    .map((identity) => identity.trim())
    .filter((identity) => identity.length > 0);

  return new Set<string>(identities);
}

/** Parses the OCPP_IDENTITY_SECRETS JSON map (identity to secret) into a Buffer-valued map. */
export function parseIdentitySecrets(rawSecrets: string | undefined): ReadonlyMap<string, Buffer> {
  if (rawSecrets === undefined || rawSecrets.trim().length === 0) {
    return new Map<string, Buffer>();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSecrets);
  } catch {
    throw new Error('OCPP_IDENTITY_SECRETS must be valid JSON (identity-to-secret object map)');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('OCPP_IDENTITY_SECRETS must be a JSON object mapping identities to secrets');
  }

  const identitySecrets = new Map<string, Buffer>();
  for (const [identity, secret] of Object.entries(parsed)) {
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error(
        `OCPP_IDENTITY_SECRETS entry for '${identity}' must be a non-empty string secret`,
      );
    }

    identitySecrets.set(identity.trim(), Buffer.from(secret));
  }

  return identitySecrets;
}

/**
 * Compares one expected secret with one provided password in constant time.
 *
 * Both values are hashed before comparison so `timingSafeEqual` can be used with inputs of
 * different lengths without leaking length information.
 */
function isSecretMatch(expectedSecret: Buffer, providedPassword: Buffer): boolean {
  const expectedDigest = createHash('sha256').update(expectedSecret).digest();
  const providedDigest = createHash('sha256').update(providedPassword).digest();

  return timingSafeEqual(expectedDigest, providedDigest);
}
