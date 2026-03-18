import type { StationSearchQueryRequest } from '@lilocharge/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MAX_SEARCH_LIMIT = 50;
const MAX_SEARCH_QUERY_LENGTH = 120;
const MIN_LATITUDE = -90;
const MIN_LONGITUDE = -180;
const MIN_SEARCH_LIMIT = 1;
const MIN_SEARCH_QUERY_LENGTH = 1;

/** DTO validating query params for tri-lingual station fuzzy search. */
export class SearchStationsQueryDto implements StationSearchQueryRequest {
  @Transform(({ value }) => normalizeSearchText(value))
  @IsString()
  @MinLength(MIN_SEARCH_QUERY_LENGTH)
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  public query!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_LATITUDE)
  @Max(MAX_LATITUDE)
  public latitude!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_LONGITUDE)
  @Max(MAX_LONGITUDE)
  public longitude!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SEARCH_LIMIT)
  @Max(MAX_SEARCH_LIMIT)
  public limit?: number;
}

/**
 * Trims and collapses whitespace in free-text station search input.
 */
function normalizeSearchText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}
