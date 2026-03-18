import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** DTO used for email/password login requests. */
export class EmailLoginDto {
  @IsEmail()
  public email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  public password!: string;
}
