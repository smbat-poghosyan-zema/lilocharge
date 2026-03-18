import type { StartSessionRequest } from '@lilocharge/shared-types';
import { IsDateString, IsOptional } from 'class-validator';

/** DTO used to start one charging session lifecycle. */
export class StartSessionDto implements StartSessionRequest {
  @IsOptional()
  @IsDateString()
  public startedAt?: string;
}
