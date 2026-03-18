import type { StopSessionRequest } from '@lilocharge/shared-types';
import { IsDateString, IsOptional } from 'class-validator';

/** DTO used to stop one active charging session lifecycle. */
export class StopSessionDto implements StopSessionRequest {
  @IsOptional()
  @IsDateString()
  public endedAt?: string;
}
