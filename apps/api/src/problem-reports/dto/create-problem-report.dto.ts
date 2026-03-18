import type { CreateProblemReportRequest } from '@lilocharge/shared-types';
import { ProblemType } from '@lilocharge/shared-types';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** DTO for creating a new station problem report. */
export class CreateProblemReportDto implements CreateProblemReportRequest {
  @IsUUID()
  @IsNotEmpty()
  readonly stationId!: string;

  @IsEnum(ProblemType)
  @IsNotEmpty()
  readonly problemType!: ProblemType;

  @IsString()
  @IsNotEmpty()
  readonly description!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly photos?: readonly string[];
}
