/** Type of problem reported by users for charging stations. */
export enum ProblemType {
  OFFLINE = 'OFFLINE',
  BROKEN_CONNECTOR = 'BROKEN_CONNECTOR',
  NO_POWER = 'NO_POWER',
  PAYMENT_ISSUE = 'PAYMENT_ISSUE',
  PHYSICAL_DAMAGE = 'PHYSICAL_DAMAGE',
  ACCESS_BLOCKED = 'ACCESS_BLOCKED',
  OTHER = 'OTHER',
}

/** Status of a problem report through its lifecycle. */
export enum ProblemReportStatus {
  PENDING = 'PENDING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
}

/** Request payload for creating a new problem report. */
export interface CreateProblemReportRequest {
  readonly stationId: string;
  readonly problemType: ProblemType;
  readonly description: string;
  readonly photos?: readonly string[];
}

/** Response payload for a problem report. */
export interface ProblemReportResponse {
  readonly id: string;
  readonly stationId: string;
  readonly userId: string;
  readonly problemType: ProblemType;
  readonly description: string;
  readonly photos: readonly string[];
  readonly status: ProblemReportStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly station?: {
    readonly id: string;
    readonly name: string;
    readonly address: string;
    readonly city: string;
  };
}

/** Query parameters for listing problem reports. */
export interface ListProblemReportsQueryRequest {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: ProblemReportStatus;
}
