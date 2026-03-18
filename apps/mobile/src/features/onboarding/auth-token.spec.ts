import { extractUserIdFromAccessToken } from './auth-token';

const TOKEN_HEADER = base64UrlEncode('{"alg":"none","typ":"JWT"}');

describe('extractUserIdFromAccessToken', () => {
  it('returns user id when JWT payload contains string sub claim', () => {
    const payload = base64UrlEncode(
      JSON.stringify({
        exp: 1900000000,
        sub: '11111111-1111-1111-1111-111111111111',
        tokenType: 'access',
      }),
    );
    const token = `${TOKEN_HEADER}.${payload}.signature`;

    expect(extractUserIdFromAccessToken(token)).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns null when token has malformed payload', () => {
    const token = `${TOKEN_HEADER}.%%%not-base64%%%.signature`;

    expect(extractUserIdFromAccessToken(token)).toBeNull();
  });

  it('returns null when payload has no sub claim', () => {
    const payload = base64UrlEncode(JSON.stringify({ tokenType: 'access' }));
    const token = `${TOKEN_HEADER}.${payload}.signature`;

    expect(extractUserIdFromAccessToken(token)).toBeNull();
  });
});

/**
 * Encodes a UTF-8 string to a base64url token segment.
 */
function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
