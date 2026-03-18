import type { CreateSessionRequest } from '@lilocharge/shared-types';
import { IsOptional, IsUUID } from 'class-validator';

/** DTO used to create one pending charging session. */
export class CreateSessionDto implements CreateSessionRequest {
  @IsOptional()
  @IsUUID()
  public connectorId?: string;

  @IsOptional()
  @IsUUID()
  public vehicleId?: string;
}
