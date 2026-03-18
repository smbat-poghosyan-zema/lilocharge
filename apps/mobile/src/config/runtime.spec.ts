import {
  resolveApiBaseUrl,
  resolveApplePayMerchantIdentifier,
  resolveGooglePayMerchantIdentifier,
  resolveInitialTabRoute,
  resolveMapboxAccessToken,
} from './runtime';

describe('runtime config', () => {
  describe('resolveApiBaseUrl', () => {
    it('returns default URL when environment variable is missing', () => {
      expect(resolveApiBaseUrl(undefined)).toBe('http://localhost:3000');
    });

    it('returns default URL when environment variable is blank', () => {
      expect(resolveApiBaseUrl('   ')).toBe('http://localhost:3000');
    });

    it('returns configured URL when value is present', () => {
      expect(resolveApiBaseUrl('https://api.lilocharge.am')).toBe('https://api.lilocharge.am');
    });
  });

  describe('resolveMapboxAccessToken', () => {
    it('returns null when token is missing', () => {
      expect(resolveMapboxAccessToken(undefined)).toBeNull();
    });

    it('returns null when token is blank', () => {
      expect(resolveMapboxAccessToken('   ')).toBeNull();
    });

    it('returns trimmed token when present', () => {
      expect(resolveMapboxAccessToken('  pk.test.token  ')).toBe('pk.test.token');
    });
  });

  describe('resolveApplePayMerchantIdentifier', () => {
    it('returns null when merchant identifier is missing', () => {
      expect(resolveApplePayMerchantIdentifier(undefined)).toBeNull();
    });

    it('returns null when merchant identifier is blank', () => {
      expect(resolveApplePayMerchantIdentifier('   ')).toBeNull();
    });

    it('returns trimmed merchant identifier when present', () => {
      expect(resolveApplePayMerchantIdentifier('  merchant.com.lilocharge  ')).toBe(
        'merchant.com.lilocharge',
      );
    });
  });

  describe('resolveGooglePayMerchantIdentifier', () => {
    it('returns null when merchant identifier is missing', () => {
      expect(resolveGooglePayMerchantIdentifier(undefined)).toBeNull();
    });

    it('returns null when merchant identifier is blank', () => {
      expect(resolveGooglePayMerchantIdentifier('   ')).toBeNull();
    });

    it('returns trimmed merchant identifier when present', () => {
      expect(resolveGooglePayMerchantIdentifier('  merchant.com.lilocharge  ')).toBe(
        'merchant.com.lilocharge',
      );
    });
  });

  describe('resolveInitialTabRoute', () => {
    it('uses stations as initial tab for Armenian language', () => {
      expect(resolveInitialTabRoute('hy')).toBe('stations');
    });

    it('uses stations as initial tab for Russian language', () => {
      expect(resolveInitialTabRoute('ru')).toBe('stations');
    });

    it('uses stations as initial tab for English language', () => {
      expect(resolveInitialTabRoute('en')).toBe('stations');
    });
  });
});
