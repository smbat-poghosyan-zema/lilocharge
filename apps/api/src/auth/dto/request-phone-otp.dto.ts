import { Matches } from 'class-validator';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

/** DTO used to request an OTP for a phone number. */
export class RequestPhoneOtpDto {
  @Matches(E164_PHONE_REGEX)
  public phone!: string;
}
