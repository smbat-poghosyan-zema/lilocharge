import type { CreateReviewRequest } from '@lilocharge/shared-types';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** DTO for creating a new review for a charging station. */
export class CreateReviewDto implements CreateReviewRequest {
  @IsUUID()
  public stationId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  public rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public comment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  public photos?: readonly string[];
}
