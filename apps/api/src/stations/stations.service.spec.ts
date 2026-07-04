import type {
  NearbyStationsQueryRequest,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { NotFoundException } from '@nestjs/common';
import type {
  ConnectorType as PrismaConnectorType,
  StationStatus as PrismaStationStatus,
} from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import type { CacheService } from '../redis/cache.service';
import { StationsService } from './stations.service';

interface NearbyStationRow {
  readonly address: string;
  readonly amenities: readonly string[];
  readonly city: string;
  readonly connectorCount: number;
  readonly distanceMeters: number | string;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly maxPowerKw: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly status: PrismaStationStatus;
}

interface StationDetailConnectorRow {
  readonly connectorType: PrismaConnectorType;
  readonly createdAt: Date;
  readonly evseId: string;
  readonly id: string;
  readonly lastStatusUpdate: Date;
  readonly powerKw: number;
  readonly stationId: string;
  readonly status: PrismaStationStatus;
  readonly updatedAt: Date;
}

interface StationDetailPricingPlanRow {
  readonly connectorId: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly idleFee: number | null;
  readonly name: string;
  readonly pricePerKwh: number | null;
  readonly pricePerMinute: number | null;
  readonly sessionFee: number | null;
  readonly updatedAt: Date;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}

interface StationDetailReviewRow {
  readonly comment: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly photos: readonly string[];
  readonly rating: number;
  readonly stationId: string;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface StationDetailAggregateRow {
  readonly address: string;
  readonly amenities: readonly string[];
  readonly averageRating: number | string | null;
  readonly city: string;
  readonly connectors: readonly StationDetailConnectorRow[];
  readonly createdAt: Date;
  readonly distanceMeters: number | string | null;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly openingHours: string | null;
  readonly operatorId: string;
  readonly operatorName: string;
  readonly pricingPlans: readonly StationDetailPricingPlanRow[];
  readonly reviewCount: number | string;
  readonly reviews: readonly StationDetailReviewRow[];
  readonly status: PrismaStationStatus;
  readonly updatedAt: Date;
}

interface PrismaServiceMock {
  readonly $queryRaw: jest.Mock<Promise<unknown[]>, [unknown]>;
}

interface CacheServiceMock {
  readonly getNearbyStations: jest.Mock;
  readonly cacheNearbyStations: jest.Mock;
  readonly getStationSearch: jest.Mock;
  readonly cacheStationSearch: jest.Mock;
  readonly getStationDetail: jest.Mock;
  readonly cacheStationDetail: jest.Mock;
}

const STATION_ID = '33333333-3333-3333-3333-333333333333';

/** Builds one nearby-station row fixture returned by raw PostGIS queries. */
function buildNearbyStationRow(overrides?: Partial<NearbyStationRow>): NearbyStationRow {
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
    status: 'AVAILABLE',
    ...overrides,
  };
}

/** Builds one connector fixture nested under station-detail aggregate payloads. */
function buildStationDetailConnectorRow(
  overrides?: Partial<StationDetailConnectorRow>,
): StationDetailConnectorRow {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    connectorType: 'CCS',
    createdAt: now,
    evseId: 'EVA-KEN-001',
    id: '44444444-4444-4444-4444-444444444444',
    lastStatusUpdate: now,
    powerKw: 120,
    stationId: STATION_ID,
    status: 'AVAILABLE',
    updatedAt: now,
    ...overrides,
  };
}

/** Builds one pricing-plan fixture nested under station-detail aggregate payloads. */
function buildStationDetailPricingPlanRow(
  overrides?: Partial<StationDetailPricingPlanRow>,
): StationDetailPricingPlanRow {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    connectorId: '44444444-4444-4444-4444-444444444444',
    createdAt: now,
    id: '55555555-5555-5555-5555-555555555555',
    idleFee: 30,
    name: 'EV Armenia Day Tariff',
    pricePerKwh: 145,
    pricePerMinute: 12,
    sessionFee: 500,
    updatedAt: now,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    ...overrides,
  };
}

/** Builds one review fixture nested under station-detail aggregate payloads. */
function buildStationDetailReviewRow(
  overrides?: Partial<StationDetailReviewRow>,
): StationDetailReviewRow {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    comment: 'Great charging speed.',
    createdAt: now,
    id: '66666666-6666-6666-6666-666666666666',
    photos: ['https://example.com/review-photo.jpg'],
    rating: 5,
    stationId: STATION_ID,
    updatedAt: now,
    userId: '77777777-7777-7777-7777-777777777777',
    ...overrides,
  };
}

/** Builds one aggregated station-detail row returned by the raw SQL detail query. */
function buildStationDetailAggregateRow(
  overrides?: Partial<StationDetailAggregateRow>,
): StationDetailAggregateRow {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    address: 'Հյուսիսային պողոտա 10',
    amenities: ['parking', 'cafe'],
    averageRating: 4.5,
    city: 'Yerevan',
    connectors: [buildStationDetailConnectorRow()],
    createdAt: now,
    distanceMeters: 1260.45,
    id: STATION_ID,
    latitude: 40.1792,
    longitude: 44.4991,
    name: 'LiloCharge Kentron Hub',
    openingHours: '24/7',
    operatorId: 'ev_armenia',
    operatorName: 'EV Armenia',
    pricingPlans: [buildStationDetailPricingPlanRow()],
    reviewCount: 1,
    reviews: [buildStationDetailReviewRow()],
    status: 'AVAILABLE',
    updatedAt: now,
    ...overrides,
  };
}

describe('StationsService', () => {
  let service: StationsService;
  let prismaMock: PrismaServiceMock;
  let cacheMock: CacheServiceMock;

  beforeEach(() => {
    prismaMock = {
      $queryRaw: jest.fn<Promise<unknown[]>, [unknown]>(),
    };

    cacheMock = {
      cacheNearbyStations: jest.fn(),
      cacheStationDetail: jest.fn(),
      cacheStationSearch: jest.fn(),
      getNearbyStations: jest.fn().mockResolvedValue(null),
      getStationDetail: jest.fn().mockResolvedValue(null),
      getStationSearch: jest.fn().mockResolvedValue(null),
    };

    service = new StationsService(
      prismaMock as unknown as PrismaService,
      cacheMock as unknown as CacheService,
    );
  });

  it('returns nearby stations mapped from ST_DWithin raw query results', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      buildNearbyStationRow(),
      buildNearbyStationRow({
        distanceMeters: '1985.7',
        id: '55555555-5555-5555-5555-555555555555',
        status: 'OCCUPIED',
      }),
    ]);

    const payload: NearbyStationsQueryRequest = {
      latitude: 40.18,
      longitude: 44.5,
    };

    const stations = await service.findNearbyStations(payload);

    expect(stations).toEqual<StationNearbyResponse[]>([
      {
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
      },
      {
        address: 'Հյուսիսային պողոտա 10',
        amenities: ['parking', 'cafe'],
        city: 'Yerevan',
        connectorCount: 2,
        distanceMeters: 1985.7,
        id: '55555555-5555-5555-5555-555555555555',
        latitude: 40.1792,
        longitude: 44.4991,
        maxPowerKw: 150,
        name: 'LiloCharge Kentron Hub',
        openingHours: '24/7',
        operatorId: 'ev_armenia',
        operatorName: 'EV Armenia',
        status: StationStatus.OCCUPIED,
      },
    ]);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);

    const [query] = prismaMock.$queryRaw.mock.calls[0] ?? [];
    const values = (query as { readonly values?: readonly unknown[] }).values;
    expect(values).toEqual(expect.arrayContaining([44.5, 40.18, 5000, 50]));
  });

  it('passes custom radius and limit values to nearby SQL builder', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await expect(
      service.findNearbyStations({
        latitude: 40.19,
        limit: 20,
        longitude: 44.52,
        radiusMeters: 2500,
      }),
    ).resolves.toEqual([]);

    const [query] = prismaMock.$queryRaw.mock.calls[0] ?? [];
    const values = (query as { readonly values?: readonly unknown[] }).values;
    expect(values).toEqual(expect.arrayContaining([44.52, 40.19, 2500, 20]));
  });

  it('passes connector, power, availability, and operator filters to nearby SQL builder', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await expect(
      service.findNearbyStations({
        availabilityStatuses: [StationStatus.AVAILABLE, StationStatus.OCCUPIED],
        connectorTypes: [ConnectorType.CCS, ConnectorType.TYPE_2],
        latitude: 40.19,
        longitude: 44.52,
        minimumPowerKw: 120,
        operatorIds: ['ev_armenia', 'operator-2'],
      }),
    ).resolves.toEqual([]);

    const [query] = prismaMock.$queryRaw.mock.calls[0] ?? [];
    const values = (query as { readonly values?: readonly unknown[] }).values;

    expect(values).toEqual(
      expect.arrayContaining([
        44.52,
        40.19,
        ConnectorType.CCS,
        ConnectorType.TYPE_2,
        120,
        StationStatus.AVAILABLE,
        StationStatus.OCCUPIED,
        'ev_armenia',
        'operator-2',
      ]),
    );
  });

  it('returns fuzzy searched stations from a tri-lingual search query', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      buildNearbyStationRow({
        id: '99999999-9999-9999-9999-999999999998',
        name: 'Կենտրոն Կայան',
      }),
      buildNearbyStationRow({
        distanceMeters: '645.12',
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Центр Заряд',
        status: 'OCCUPIED',
      }),
    ]);

    const payload: StationSearchQueryRequest = {
      latitude: 40.1792,
      limit: 15,
      longitude: 44.4991,
      query: 'kentron',
    };

    await expect(service.searchStations(payload)).resolves.toEqual<StationNearbyResponse[]>([
      {
        address: 'Հյուսիսային պողոտա 10',
        amenities: ['parking', 'cafe'],
        city: 'Yerevan',
        connectorCount: 2,
        distanceMeters: 1260.45,
        id: '99999999-9999-9999-9999-999999999998',
        latitude: 40.1792,
        longitude: 44.4991,
        maxPowerKw: 150,
        name: 'Կենտրոն Կայան',
        openingHours: '24/7',
        operatorId: 'ev_armenia',
        operatorName: 'EV Armenia',
        status: StationStatus.AVAILABLE,
      },
      {
        address: 'Հյուսիսային պողոտա 10',
        amenities: ['parking', 'cafe'],
        city: 'Yerevan',
        connectorCount: 2,
        distanceMeters: 645.12,
        id: '99999999-9999-9999-9999-999999999999',
        latitude: 40.1792,
        longitude: 44.4991,
        maxPowerKw: 150,
        name: 'Центр Заряд',
        openingHours: '24/7',
        operatorId: 'ev_armenia',
        operatorName: 'EV Armenia',
        status: StationStatus.OCCUPIED,
      },
    ]);

    const [query] = prismaMock.$queryRaw.mock.calls[0] ?? [];
    const values = (query as { readonly values?: readonly unknown[] }).values;
    expect(values).toEqual(expect.arrayContaining(['kentron', 44.4991, 40.1792, 15]));
  });

  it('returns aggregated station detail with connectors, pricing plans, reviews, and distance', async () => {
    const secondConnectorId = '88888888-8888-8888-8888-888888888888';

    prismaMock.$queryRaw.mockResolvedValue([
      buildStationDetailAggregateRow({
        averageRating: '4.5',
        connectors: [
          buildStationDetailConnectorRow(),
          buildStationDetailConnectorRow({
            connectorType: 'TYPE_2',
            evseId: 'EVA-KEN-002',
            id: secondConnectorId,
            powerKw: 22,
            status: 'OFFLINE',
          }),
        ],
        pricingPlans: [
          buildStationDetailPricingPlanRow(),
          buildStationDetailPricingPlanRow({
            connectorId: secondConnectorId,
            id: '99999999-9999-9999-9999-999999999999',
            idleFee: null,
            name: 'EV Armenia AC Standard',
            pricePerKwh: 95,
            pricePerMinute: null,
            sessionFee: null,
            validFrom: new Date('2026-02-01T00:00:00.000Z'),
          }),
        ],
        reviewCount: 2,
        reviews: [
          buildStationDetailReviewRow(),
          buildStationDetailReviewRow({
            comment: null,
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            photos: [],
            rating: 4,
            userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          }),
        ],
      }),
    ]);

    const query: StationDetailQueryRequest = {
      latitude: 40.18,
      longitude: 44.5,
    };

    const station = await service.getStationDetail(STATION_ID, query);

    expect(station).toEqual<StationDetailResponse>({
      address: 'Հյուսիսային պողոտա 10',
      amenities: ['parking', 'cafe'],
      averageRating: 4.5,
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
        {
          connectorType: ConnectorType.TYPE_2,
          createdAt: '2026-02-17T00:00:00.000Z',
          evseId: 'EVA-KEN-002',
          id: secondConnectorId,
          lastStatusUpdate: '2026-02-17T00:00:00.000Z',
          powerKw: 22,
          stationId: STATION_ID,
          status: StationStatus.OFFLINE,
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
        {
          connectorId: secondConnectorId,
          createdAt: '2026-02-17T00:00:00.000Z',
          id: '99999999-9999-9999-9999-999999999999',
          idleFee: null,
          name: 'EV Armenia AC Standard',
          pricePerKwh: 95,
          pricePerMinute: null,
          sessionFee: null,
          updatedAt: '2026-02-17T00:00:00.000Z',
          validFrom: '2026-02-01T00:00:00.000Z',
          validUntil: null,
        },
      ],
      reviewCount: 2,
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
        {
          comment: null,
          createdAt: '2026-02-17T00:00:00.000Z',
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          photos: [],
          rating: 4,
          stationId: STATION_ID,
          updatedAt: '2026-02-17T00:00:00.000Z',
          userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
      ],
      status: StationStatus.AVAILABLE,
      updatedAt: '2026-02-17T00:00:00.000Z',
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    const [detailQuerySql] = prismaMock.$queryRaw.mock.calls[0] ?? [];
    const values = (detailQuerySql as { readonly values?: readonly unknown[] }).values;
    expect(values).toEqual(expect.arrayContaining([STATION_ID, 44.5, 40.18]));
  });

  it('returns null distance when station detail query has no coordinate context', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      buildStationDetailAggregateRow({
        averageRating: null,
        distanceMeters: null,
        pricingPlans: [],
        reviewCount: 0,
        reviews: [],
      }),
    ]);

    const station = await service.getStationDetail(STATION_ID, {});

    expect(station.distanceMeters).toBeNull();
    expect(station.averageRating).toBeNull();
    expect(station.reviewCount).toBe(0);
    expect(station.reviews).toEqual([]);
    expect(station.pricingPlans).toEqual([]);
  });

  it('throws not found when station detail query returns no rows', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    await expect(service.getStationDetail(STATION_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
