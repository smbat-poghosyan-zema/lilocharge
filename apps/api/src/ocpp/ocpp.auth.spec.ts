import {
  evaluateChargePointAuth,
  parseAllowedIdentities,
  parseIdentitySecrets,
  resolveOcppAuthConfig,
  resolveOcppAuthMode,
} from './ocpp.auth';

describe('resolveOcppAuthMode', () => {
  it('defaults to open mode when unset or blank', () => {
    expect(resolveOcppAuthMode(undefined)).toBe('open');
    expect(resolveOcppAuthMode('')).toBe('open');
    expect(resolveOcppAuthMode('   ')).toBe('open');
  });

  it('accepts known modes case-insensitively', () => {
    expect(resolveOcppAuthMode('open')).toBe('open');
    expect(resolveOcppAuthMode('ALLOWLIST')).toBe('allowlist');
    expect(resolveOcppAuthMode(' Basic ')).toBe('basic');
  });

  it('throws on unknown modes instead of silently falling back to open', () => {
    expect(() => resolveOcppAuthMode('allow-list')).toThrow(/Invalid OCPP_AUTH_MODE/);
  });
});

describe('parseAllowedIdentities', () => {
  it('parses comma-separated identities with trimming and de-duplication', () => {
    const identities = parseAllowedIdentities(' CP-001, CP-002 ,CP-001,, ');

    expect(identities.size).toBe(2);
    expect(identities.has('CP-001')).toBe(true);
    expect(identities.has('CP-002')).toBe(true);
  });

  it('returns an empty set when unset', () => {
    expect(parseAllowedIdentities(undefined).size).toBe(0);
  });
});

describe('parseIdentitySecrets', () => {
  it('parses a valid identity-to-secret JSON map', () => {
    const secrets = parseIdentitySecrets('{"CP-001":"s3cret","CP-002":"other"}');

    expect(secrets.size).toBe(2);
    expect(secrets.get('CP-001')?.toString()).toBe('s3cret');
  });

  it('throws on invalid JSON, non-object payloads, and empty secrets', () => {
    expect(() => parseIdentitySecrets('not-json')).toThrow(/must be valid JSON/);
    expect(() => parseIdentitySecrets('["CP-001"]')).toThrow(/JSON object/);
    expect(() => parseIdentitySecrets('{"CP-001":""}')).toThrow(/non-empty string secret/);
    expect(() => parseIdentitySecrets('{"CP-001":42}')).toThrow(/non-empty string secret/);
  });
});

describe('resolveOcppAuthConfig', () => {
  it('resolves open mode by default with empty allowlist and secret map', () => {
    const config = resolveOcppAuthConfig({});

    expect(config.mode).toBe('open');
    expect(config.allowedIdentities.size).toBe(0);
    expect(config.identitySecrets.size).toBe(0);
  });

  it('requires a non-empty allowlist in allowlist mode', () => {
    expect(() => resolveOcppAuthConfig({ OCPP_AUTH_MODE: 'allowlist' })).toThrow(
      /OCPP_ALLOWED_IDENTITIES/,
    );

    const config = resolveOcppAuthConfig({
      OCPP_ALLOWED_IDENTITIES: 'CP-001,CP-002',
      OCPP_AUTH_MODE: 'allowlist',
    });

    expect(config.mode).toBe('allowlist');
    expect(config.allowedIdentities.has('CP-002')).toBe(true);
  });

  it('requires a non-empty secret map in basic mode', () => {
    expect(() => resolveOcppAuthConfig({ OCPP_AUTH_MODE: 'basic' })).toThrow(
      /OCPP_IDENTITY_SECRETS/,
    );

    const config = resolveOcppAuthConfig({
      OCPP_AUTH_MODE: 'basic',
      OCPP_IDENTITY_SECRETS: '{"CP-001":"s3cret"}',
    });

    expect(config.mode).toBe('basic');
    expect(config.identitySecrets.has('CP-001')).toBe(true);
  });
});

describe('evaluateChargePointAuth', () => {
  it('accepts any identity in open mode', () => {
    const config = resolveOcppAuthConfig({});

    expect(evaluateChargePointAuth(config, 'CP-ANY', undefined).accepted).toBe(true);
  });

  it('accepts allowlisted identities and rejects unknown identities in allowlist mode', () => {
    const config = resolveOcppAuthConfig({
      OCPP_ALLOWED_IDENTITIES: 'CP-001, CP-002',
      OCPP_AUTH_MODE: 'allowlist',
    });

    expect(evaluateChargePointAuth(config, 'CP-001', undefined).accepted).toBe(true);
    expect(evaluateChargePointAuth(config, 'CP-999', undefined).accepted).toBe(false);
  });

  it('accepts matching credentials and rejects wrong or missing passwords in basic mode', () => {
    const config = resolveOcppAuthConfig({
      OCPP_AUTH_MODE: 'basic',
      OCPP_IDENTITY_SECRETS: '{"CP-001":"s3cret"}',
    });

    expect(evaluateChargePointAuth(config, 'CP-001', Buffer.from('s3cret')).accepted).toBe(true);
    expect(evaluateChargePointAuth(config, 'CP-001', Buffer.from('wrong')).accepted).toBe(false);
    expect(evaluateChargePointAuth(config, 'CP-001', undefined).accepted).toBe(false);
    expect(evaluateChargePointAuth(config, 'CP-404', Buffer.from('s3cret')).accepted).toBe(false);
  });
});
