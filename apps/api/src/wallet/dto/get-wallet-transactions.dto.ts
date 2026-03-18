import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Query parameters for fetching paginated wallet transaction history.
 * Supports filtering by transaction type and cursor-based pagination.
 */
export class GetWalletTransactionsDto {
  @IsOptional()
  @IsEnum(['TOP_UP', 'DEDUCTION', 'REFUND'])
  readonly type?: 'TOP_UP' | 'DEDUCTION' | 'REFUND';

  @IsOptional()
  @IsInt()
  @Min(1)
  readonly limit?: number;

  @IsOptional()
  readonly cursor?: string;
}
