/** Supported EV connector types used across vehicles and station connectors. */
export enum ConnectorType {
  TYPE_1 = 'TYPE_1',
  TYPE_2 = 'TYPE_2',
  CCS = 'CCS',
  CHADEMO = 'CHADEMO',
  TESLA = 'TESLA',
  GBT = 'GBT',
}

/** Vehicle payload returned by vehicle CRUD endpoints. */
export interface VehicleResponse {
  readonly id: string;
  readonly userId: string;
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly connectorType: ConnectorType;
  readonly batteryCapacity: number;
  readonly maxChargePower: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Request payload for creating a new user vehicle profile. */
export interface CreateVehicleRequest {
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly connectorType?: ConnectorType;
  readonly batteryCapacity: number;
  readonly maxChargePower: number;
}

/** Request payload for updating editable vehicle fields. */
export interface UpdateVehicleRequest {
  readonly make?: string;
  readonly model?: string;
  readonly year?: number;
  readonly connectorType?: ConnectorType;
  readonly batteryCapacity?: number;
  readonly maxChargePower?: number;
}
