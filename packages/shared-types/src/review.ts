/** Request payload for creating a new review for a charging station. */
export interface CreateReviewRequest {
  readonly stationId: string;
  readonly rating: number;
  readonly comment?: string;
  readonly photos?: readonly string[];
}

/** Request payload for updating an existing station review. */
export interface UpdateReviewRequest {
  readonly rating?: number;
  readonly comment?: string;
  readonly photos?: readonly string[];
}

/** Response payload for a single user review. */
export interface UserReviewResponse {
  readonly id: string;
  readonly stationId: string;
  readonly userId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly photos: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly station?: {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly city: string;
  };
}

/** Query parameters for paginated review list endpoints. */
export interface ListReviewsQueryRequest {
  readonly page?: number;
  readonly limit?: number;
}
