import type {
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import type { StationsService } from './stations.service';
import { StationsController } from './stations.controller';
import { NearbyStationsQueryDto } from './dto/nearby-stations-query.dto';
import type { StationDetailQueryDto } from './dto/station-detail-query.dto';

interface StationsServiceMock {
  readonly findNearbyStations: jest.Mock<
    Promise<StationNearbyResponse[]>,
    [NearbyStationsQueryDto]
  >;
  readonly getStationDetail: jest.Mock<
    Promise<StationDetailResponse>,
    [string, StationDetailQueryDto]
  >;
  readonly searchStations: jest.Mock<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>;
}

const STATION_ID = '33333333-3333-3333-3333-333333333333';

/** Builds a nearby station response fixture for controller delegation tests. */
function buildNearbyStationResponse(): StationNearbyResponse {
  return {
    address: 'Հյուսիսային պողոտա 10',
    amenities: ['parking', 'cafe'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 1260.45,
    id: STATION_ID,
    latitude: 40.1792,
    longitude: 44.4991,
    maxPowerKw: 150,
    name: 'LiloCharge Kentron Hub',
    openingHours: '24/7',
    operatorId: 'ev_armenia',
    operatorName: 'EV Armenia',
    status: StationStatus.AVAILABLE,
  };
}

/** Builds a station detail response fixture for controller delegation tests. */
function buildStationDetailResponse(): StationDetailResponse {
  return {
    address: 'Հյուսիսային պողոտա 10',
    averageRating: 4.5,
    amenities: ['parking', 'cafe'],
    city: 'Yerevan',
    connectors: [
      {
        connectorType: ConnectorType.CCS,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVA-KEN-001',
        id: '44444444-4444-4444-4444-444444444444',
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 120,
        stationId: STATION_ID,
        status: StationStatus.AVAILABLE,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
    ],
    createdAt: '2026-02-17T00:00:00.000Z',
    distanceMeters: 1260.45,
    id: STATION_ID,
    latitude: 40.1792,
    longitude: 44.4991,
    name: 'LiloCharge Kentron Hub',
    openingHours: '24/7',
    operatorId: 'ev_armenia',
    operatorName: 'EV Armenia',
    pricingPlans: [
      {
        connectorId: '44444444-4444-4444-4444-444444444444',
        createdAt: '2026-02-17T00:00:00.000Z',
        id: '55555555-5555-5555-5555-555555555555',
        idleFee: 30,
        name: 'EV Armenia Day Tariff',
        pricePerKwh: 145,
        pricePerMinute: 12,
        sessionFee: 500,
        updatedAt: '2026-02-17T00:00:00.000Z',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
      },
    ],
    reviewCount: 1,
    reviews: [
      {
        comment: 'Great charging speed.',
        createdAt: '2026-02-17T00:00:00.000Z',
        id: '66666666-6666-6666-6666-666666666666',
        photos: ['https://example.com/review-photo.jpg'],
        rating: 5,
        stationId: STATION_ID,
        updatedAt: '2026-02-17T00:00:00.000Z',
        userId: '77777777-7777-7777-7777-777777777777',
      },
    ],
    status: StationStatus.AVAILABLE,
    updatedAt: '2026-02-17T00:00:00.000Z',
  };
}

describe('StationsController', () => {
  it('delegates nearby and detail station lookups to stations service methods', async () => {
    const nearbyStations = [buildNearbyStationResponse()];
    const stationDetail = buildStationDetailResponse();

    const stationsServiceMock: StationsServiceMock = {
      findNearbyStations: jest
        .fn<Promise<StationNearbyResponse[]>, [NearbyStationsQueryDto]>()
        .mockResolvedValue(nearbyStations),
      getStationDetail: jest
        .fn<Promise<StationDetailResponse>, [string, StationDetailQueryDto]>()
        .mockResolvedValue(stationDetail),
      searchStations: jest
        .fn<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>()
        .mockResolvedValue(nearbyStations),
    };

    const controller = new StationsController(stationsServiceMock as unknown as StationsService);
    const nearbyQuery: NearbyStationsQueryDto = {
      availabilityStatuses: [StationStatus.AVAILABLE],
      connectorTypes: [ConnectorType.CCS],
      latitude: 40.18,
      limit: 10,
      longitude: 44.5,
      minimumPowerKw: 80,
      operatorIds: ['ev_armenia'],
      radiusMeters: 3000,
    };
    const detailQuery: StationDetailQueryDto = {
      latitude: 40.18,
      longitude: 44.5,
    };
    const searchQuery: StationSearchQueryRequest = {
      latitude: 40.18,
      limit: 10,
      longitude: 44.5,
      query: 'кентрон',
    };

    await expect(controller.findNearbyStations(nearbyQuery)).resolves.toEqual(nearbyStations);
    await expect(controller.searchStations(searchQuery)).resolves.toEqual(nearbyStations);
    await expect(controller.getStationDetail(STATION_ID, detailQuery)).resolves.toEqual(
      stationDetail,
    );

    expect(stationsServiceMock.findNearbyStations).toHaveBeenCalledWith(nearbyQuery);
    expect(stationsServiceMock.searchStations).toHaveBeenCalledWith(searchQuery);
    expect(stationsServiceMock.getStationDetail).toHaveBeenCalledWith(STATION_ID, detailQuery);
  });
});
