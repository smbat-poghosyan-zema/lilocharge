import { IsJWT } from 'class-validator';

/** DTO used for obtaining a new token pair via refresh token. */
export class RefreshTokenDto {
  @IsJWT()
  public refreshToken!: string;
}
