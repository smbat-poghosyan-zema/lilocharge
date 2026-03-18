import type { StationDetailResponse, StationNearbyResponse } from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';

import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';

const STATION_ID = '33333333-3333-3333-3333-333333333333';
const CONNECTOR_CCS_ID = '44444444-4444-4444-4444-444444444444';
const CONNECTOR_TYPE2_ID = '55555555-5555-5555-5555-555555555555';

/** Builds a nearby station response fixture with connectorCount and maxPowerKw. */
function buildNearbyStationResponse(
  overrides?: Partial<StationNearbyResponse>,
): StationNearbyResponse {
  return {
    address: 'Հյուdelays պողdelays 10',
    amenities: ['parking', 'cafe'],
    city: 'Yerevan',
    connectorCount: 3,
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
    ...overrides,
  };
}

/** Builds a station detail response fixture with CCS and Type2 connectors. */
function buildStationDetailResponse(
  overrides?: Partial<StationDetailResponse>,
): StationDetailResponse {
  return {
    address: 'Հyuses 10',
    amenities: ['parking', 'cafe'],
    averageRating: 4.5,
    city: 'Yerevan',
    connectors: [
      {
        connectorType: ConnectorType.CCS,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVA-KEN-001',
        id: CONNECTOR_CCS_ID,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 150,
        stationId: STATION_ID,
        status: StationStatus.AVAILABLE,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
      {
        connectorType: ConnectorType.TYPE_2,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVA-KEN-002',
        id: CONNECTOR_TYPE2_ID,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 22,
        stationId: STATION_ID,
        status: StationStatus.OCCUPIED,
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
    pricingPlans: [],
    reviewCount: 1,
    reviews: [],
    status: StationStatus.AVAILABLE,
    updatedAt: '2026-02-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('StationsController (Integration — HTTP request/response contracts)', () => {
  let app: NestFastifyApplication;
  let stationsServiceMock: {
    findNearbyStations: jest.Mock;
    searchStations: jest.Mock;
    getStationDetail: jest.Mock;
  };

  beforeAll(async () => {
    stationsServiceMock = {
      findNearbyStations: jest.fn(),
      getStationDetail: jest.fn(),
      searchStations: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [StationsController],
      providers: [
        {
          provide: StationsService,
          useValue: stationsServiceMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('C1 — GET /stations/nearby returns connectorCount and maxPowerKw', () => {
    it('Given nearby stations exist, When queried, Then response includes connectorCount and maxPowerKw', async () => {
      const nearbyStation = buildNearbyStationResponse();
      stationsServiceMock.findNearbyStations.mockResolvedValue([nearbyStation]);

      const response = await app.inject({
        method: 'GET',
        url: '/stations/nearby?latitude=40.18&longitude=44.5',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as StationNearbyResponse[];
      expect(body).toHaveLength(1);
      expect(body[0].connectorCount).toBe(3);
      expect(body[0].maxPowerKw).toBe(150);
      expect(body[0].id).toBe(STATION_ID);
      expect(body[0].status).toBe(StationStatus.AVAILABLE);
    });
  });

  describe('C2 — GET /stations/:id returns 200 with full connector list when no filters', () => {
    it('Given a station exists, When detail is requested without filters, Then response includes all connectors', async () => {
      const detail = buildStationDetailResponse();
      stationsServiceMock.getStationDetail.mockResolvedValue(detail);

      const response = await app.inject({
        method: 'GET',
        url: `/stations/${STATION_ID}`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as StationDetailResponse;
      expect(body.id).toBe(STATION_ID);
      expect(body.connectors).toHaveLength(2);
      expect(body.connectors[0].connectorType).toBe(ConnectorType.CCS);
      expect(body.connectors[1].connectorType).toBe(ConnectorType.TYPE_2);

      expect(stationsServiceMock.getStationDetail).toHaveBeenCalledWith(
        STATION_ID,
        expect.objectContaining({}),
      );
    });
  });

  describe('C3 — GET /stations/:id?connectorTypes=CCS returns only CCS connectors', () => {
    it('Given connector type filter CCS, When detail is requested, Then service receives CCS filter', async () => {
      const ccsOnlyDetail = buildStationDetailResponse({
        connectors: [buildStationDetailResponse().connectors[0]],
      });
      stationsServiceMock.getStationDetail.mockResolvedValue(ccsOnlyDetail);

      const response = await app.inject({
        method: 'GET',
        url: `/stations/${STATION_ID}?connectorTypes=CCS`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as StationDetailResponse;
      expect(body.connectors).toHaveLength(1);
      expect(body.connectors[0].connectorType).toBe(ConnectorType.CCS);

      expect(stationsServiceMock.getStationDetail).toHaveBeenCalledWith(
        STATION_ID,
        expect.objectContaining({
          connectorTypes: [ConnectorType.CCS],
        }),
      );
    });
  });

  describe('C4 — GET /stations/:id?minimumPowerKw=50 returns only connectors >= 50kW', () => {
    it('Given minimum power filter 50, When detail is requested, Then service receives minimumPowerKw=50', async () => {
      const filteredDetail = buildStationDetailResponse({
        connectors: [buildStationDetailResponse().connectors[0]],
      });
      stationsServiceMock.getStationDetail.mockResolvedValue(filteredDetail);

      const response = await app.inject({
        method: 'GET',
        url: `/stations/${STATION_ID}?minimumPowerKw=50`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as StationDetailResponse;
      expect(body.connectors).toHaveLength(1);
      expect(body.connectors[0].powerKw).toBeGreaterThanOrEqual(50);

      expect(stationsServiceMock.getStationDetail).toHaveBeenCalledWith(
        STATION_ID,
        expect.objectContaining({
          minimumPowerKw: 50,
        }),
      );
    });
  });

  describe('C5 — GET /stations/:id?connectorTypes=CCS&minimumPowerKw=50 applies both filters', () => {
    it('Given both filters, When detail is requested, Then service receives both connectorTypes and minimumPowerKw', async () => {
      const filteredDetail = buildStationDetailResponse({
        connectors: [buildStationDetailResponse().connectors[0]],
      });
      stationsServiceMock.getStationDetail.mockResolvedValue(filteredDetail);

      const response = await app.inject({
        method: 'GET',
        url: `/stations/${STATION_ID}?connectorTypes=CCS&minimumPowerKw=50`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as StationDetailResponse;
      expect(body.connectors).toHaveLength(1);

      expect(stationsServiceMock.getStationDetail).toHaveBeenCalledWith(
        STATION_ID,
        expect.objectContaining({
          connectorTypes: [ConnectorType.CCS],
          minimumPowerKw: 50,
        }),
      );
    });
  });

  describe('C6 — GET /stations/:id?minimumPowerKw=abc returns 400 Bad Request', () => {
    it('Given invalid minimumPowerKw value, When detail is requested, Then 400 Bad Request is returned', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/stations/${STATION_ID}?minimumPowerKw=abc`,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as { statusCode: number; message: string };
      expect(body.statusCode).toBe(400);
      expect(stationsServiceMock.getStationDetail).not.toHaveBeenCalled();
    });
  });
});
