/** Session lifecycle states tracked throughout a charging flow. */
export enum SessionStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Request payload for creating a new pending charging session. */
export interface CreateSessionRequest {
  readonly connectorId?: string;
  readonly vehicleId?: string;
}

/** Request payload for transitioning a session into an active charging state. */
export interface StartSessionRequest {
  readonly startedAt?: string;
}

/** Request payload for transitioning an active session into completed state. */
export interface StopSessionRequest {
  readonly endedAt?: string;
}

/** Charging session payload returned by lifecycle management endpoints. */
export interface SessionResponse {
  readonly id: string;
  readonly userId: string;
  readonly vehicleId: string | null;
  readonly connectorId: string | null;
  readonly status: SessionStatus;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly energyDelivered: number;
  readonly peakPower: number;
  readonly totalCost: number;
  readonly transactionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Query parameters for retrieving session history with pagination and filtering. */
export interface SessionHistoryQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: SessionStatus;
  readonly startDate?: string;
  readonly endDate?: string;
}

/** Paginated response containing session history and metadata. */
export interface SessionHistoryResponse {
  readonly sessions: readonly SessionHistoryItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

/** Session history item with station and connector details. */
export interface SessionHistoryItem {
  readonly id: string;
  readonly status: SessionStatus;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly energyDelivered: number;
  readonly totalCost: number;
  readonly stationName: string | null;
  readonly stationAddress: string | null;
  readonly connectorType: string | null;
  readonly powerKw: number | null;
  readonly createdAt: string;
}

/** Receipt data structure for PDF generation. */
export interface SessionReceiptData {
  readonly sessionId: string;
  readonly userId: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly stationName: string;
  readonly stationAddress: string;
  readonly connectorType: string;
  readonly powerKw: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly duration: number;
  readonly energyDelivered: number;
  readonly peakPower: number;
  readonly totalCost: number;
  readonly receiptNumber: string;
  readonly generatedAt: string;
}
