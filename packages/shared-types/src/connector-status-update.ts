import type { StationStatus } from './station';

/** Request payload for creating a new connector status update. */
export interface CreateConnectorStatusUpdateRequest {
  readonly connectorId: string;
  readonly status: StationStatus;
  readonly comment?: string;
}

/** Response payload for a connector status update. */
export interface ConnectorStatusUpdateResponse {
  readonly id: string;
  readonly connectorId: string;
  readonly userId: string;
  readonly status: StationStatus;
  readonly comment: string | null;
  readonly confidenceScore: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly connector?: {
    readonly id: string;
    readonly evseId: string;
    readonly connectorType: string;
    readonly powerKw: number;
    readonly station: {
      readonly id: string;
      readonly name: string;
      readonly address: string;
      readonly city: string;
    };
  };
}

/** Query parameters for listing connector status updates. */
export interface ListConnectorStatusUpdatesQueryRequest {
  readonly page?: number;
  readonly limit?: number;
  readonly connectorId?: string;
  readonly userId?: string;
}

/** Response payload for the most confident status update per connector. */
export interface MostConfidentStatusResponse {
  readonly connectorId: string;
  readonly status: StationStatus;
  readonly confidenceScore: number;
  readonly latestUpdate: ConnectorStatusUpdateResponse;
}
