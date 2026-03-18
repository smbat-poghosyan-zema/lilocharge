import type { UpdateReviewRequest } from '@lilocharge/shared-types';
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** DTO for updating an existing station review. */
export class UpdateReviewDto implements UpdateReviewRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  public rating?: number;

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
