import { buildHelmetOptions, parseCorsOrigins, resolvePort } from './main';

describe('main bootstrap helpers', () => {
  describe('buildHelmetOptions', () => {
    it('keeps a restrictive CSP baseline', () => {
      const options = buildHelmetOptions();
      const csp = options.contentSecurityPolicy;

      expect(csp).not.toBe(false);
      if (csp === false || csp === true || csp === undefined) {
        throw new Error('expected an explicit CSP configuration');
      }

      expect(csp.directives).toMatchObject({
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      });
    });

    it('relaxes only the directives required by the Swagger UI at /docs', () => {
      const options = buildHelmetOptions();
      const csp = options.contentSecurityPolicy;
      if (csp === false || csp === true || csp === undefined) {
        throw new Error('expected an explicit CSP configuration');
      }

      expect(csp.directives).toMatchObject({
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
      });
      expect(options.crossOriginEmbedderPolicy).toBe(false);
    });
  });

  describe('parseCorsOrigins', () => {
    it('uses default whitelisted origins when no value is configured', () => {
      expect(parseCorsOrigins(undefined)).toEqual([
        'http://localhost:3000',
        'http://localhost:19006',
      ]);
    });

    it('allows all origins for wildcard values', () => {
      expect(parseCorsOrigins('*')).toBe(true);
    });

    it('uses default whitelist for blank values', () => {
      expect(parseCorsOrigins('   ')).toEqual(['http://localhost:3000', 'http://localhost:19006']);
    });

    it('parses comma-delimited origins', () => {
      expect(parseCorsOrigins('https://a.example, https://b.example')).toEqual([
        'https://a.example',
        'https://b.example',
      ]);
    });

    it('drops empty entries while preserving valid origins', () => {
      expect(parseCorsOrigins(' https://a.example ,, https://b.example,')).toEqual([
        'https://a.example',
        'https://b.example',
      ]);
    });
  });

  describe('resolvePort', () => {
    it('falls back to default port when value is missing', () => {
      expect(resolvePort(undefined)).toBe(3000);
    });

    it('returns parsed port when value is valid', () => {
      expect(resolvePort('3100')).toBe(3100);
    });

    it('falls back to default for invalid values', () => {
      expect(resolvePort('0')).toBe(3000);
      expect(resolvePort('70000')).toBe(3000);
      expect(resolvePort('not-a-number')).toBe(3000);
    });
  });
});
