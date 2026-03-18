import type {
  ConnectorPricingCalculationRequest,
  ConnectorPricingCalculationResponse,
  StationConnectorResponse,
  UpdateConnectorStatusRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import type { ConnectorsService } from './connectors.service';
import { ConnectorsController } from './connectors.controller';

interface ConnectorsServiceMock {
  readonly calculatePricing: jest.Mock<
    Promise<ConnectorPricingCalculationResponse>,
    [string, ConnectorPricingCalculationRequest]
  >;
  readonly updateConnectorStatus: jest.Mock<
    Promise<StationConnectorResponse>,
    [string, UpdateConnectorStatusRequest]
  >;
}

const CONNECTOR_ID = '44444444-4444-4444-4444-444444444444';
const STATION_ID = '33333333-3333-3333-3333-333333333333';

/** Builds one connector response fixture for controller delegation tests. */
function buildConnectorResponse(): StationConnectorResponse {
  return {
    connectorType: ConnectorType.CCS,
    createdAt: '2026-02-17T00:00:00.000Z',
    evseId: 'EVA-KEN-001',
    id: CONNECTOR_ID,
    lastStatusUpdate: '2026-02-17T10:00:00.000Z',
    powerKw: 120,
    stationId: STATION_ID,
    status: StationStatus.AVAILABLE,
    updatedAt: '2026-02-17T00:00:00.000Z',
  };
}

/** Builds one connector pricing response fixture for controller delegation tests. */
function buildPricingResponse(): ConnectorPricingCalculationResponse {
  return {
    calculateAt: '2026-02-17T11:00:00.000Z',
    chargingDurationMinutes: 47.5,
    chargingTimeCost: 570,
    connectorId: CONNECTOR_ID,
    currencyCode: 'AMD',
    energyCost: 2668,
    energyKwh: 18.4,
    idleCost: 96,
    idleDurationMinutes: 3.2,
    idleFee: 30,
    pricePerKwh: 145,
    pricePerMinute: 12,
    pricingPlanId: '55555555-5555-5555-5555-555555555555',
    pricingPlanName: 'EV Armenia Day Tariff',
    sessionFee: 500,
    sessionFeeCost: 500,
    totalCost: 3834,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  };
}

describe('ConnectorsController', () => {
  it('delegates status updates and pricing calculations to connectors service methods', async () => {
    const connectorResponse = buildConnectorResponse();
    const pricingResponse = buildPricingResponse();
    const connectorsServiceMock: ConnectorsServiceMock = {
      calculatePricing: jest
        .fn<
          Promise<ConnectorPricingCalculationResponse>,
          [string, ConnectorPricingCalculationRequest]
        >()
        .mockResolvedValue(pricingResponse),
      updateConnectorStatus: jest
        .fn<Promise<StationConnectorResponse>, [string, UpdateConnectorStatusRequest]>()
        .mockResolvedValue(connectorResponse),
    };
    const controller = new ConnectorsController(
      connectorsServiceMock as unknown as ConnectorsService,
    );

    const statusPayload: UpdateConnectorStatusRequest = {
      status: StationStatus.OCCUPIED,
    };
    const pricingPayload: ConnectorPricingCalculationRequest = {
      chargingDurationMinutes: 47.5,
      energyKwh: 18.4,
      idleDurationMinutes: 3.2,
    };

    await expect(controller.updateConnectorStatus(CONNECTOR_ID, statusPayload)).resolves.toEqual(
      connectorResponse,
    );
    await expect(controller.calculatePricing(CONNECTOR_ID, pricingPayload)).resolves.toEqual(
      pricingResponse,
    );

    expect(connectorsServiceMock.updateConnectorStatus).toHaveBeenCalledWith(
      CONNECTOR_ID,
      statusPayload,
    );
    expect(connectorsServiceMock.calculatePricing).toHaveBeenCalledWith(
      CONNECTOR_ID,
      pricingPayload,
    );
  });
});
