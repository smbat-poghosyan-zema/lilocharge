import { StationStatus } from './station';

/** Request payload for updating a connector's latest availability state. */
export interface UpdateConnectorStatusRequest {
  readonly status: StationStatus;
  readonly lastStatusUpdate?: string;
}

/** Request payload for tariff-based connector pricing calculations. */
export interface ConnectorPricingCalculationRequest {
  readonly energyKwh: number;
  readonly chargingDurationMinutes: number;
  readonly idleDurationMinutes?: number;
  readonly calculateAt?: string;
}

/** Tariff and usage pricing breakdown returned by connector pricing calculations. */
export interface ConnectorPricingCalculationResponse {
  readonly connectorId: string;
  readonly pricingPlanId: string;
  readonly pricingPlanName: string;
  readonly currencyCode: 'AMD';
  readonly calculateAt: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly energyKwh: number;
  readonly chargingDurationMinutes: number;
  readonly idleDurationMinutes: number;
  readonly pricePerKwh: number | null;
  readonly pricePerMinute: number | null;
  readonly idleFee: number | null;
  readonly sessionFee: number | null;
  readonly energyCost: number;
  readonly chargingTimeCost: number;
  readonly idleCost: number;
  readonly sessionFeeCost: number;
  readonly totalCost: number;
}
