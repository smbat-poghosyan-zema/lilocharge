/** Supported user-facing language codes used by API contracts. */
export type SupportedLanguageCode = 'hy' | 'ru' | 'en';

/** Response payload returned after requesting an OTP code by phone number. */
export interface PhoneOtpRequestResponse {
  readonly message: string;
  readonly expiresInSeconds: number;
}

/** Standard token pair response returned by auth endpoints. */
export interface AuthTokenPairResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
}
