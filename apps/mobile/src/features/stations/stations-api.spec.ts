import type {
  MostConfidentStatusResponse,
  NearbyStationsQueryRequest,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';

import { createStationsApi } from './stations-api';

describe('stations api', () => {
  it('requests nearby stations through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn<
        Promise<StationNearbyResponse[]>,
        [string, { query: NearbyStationsQueryRequest }]
      >(() => {
        return Promise.resolve([
          {
            address: 'Arami 6',
            amenities: ['parking'],
            city: 'Yerevan',
            connectorCount: 2,
            distanceMeters: 320,
            id: '11111111-1111-1111-1111-111111111111',
            latitude: 40.177,
            longitude: 44.511,
            maxPowerKw: 50,
            name: 'Arami Fast Charge',
            openingHours: '24/7',
            operatorId: 'operator-1',
            operatorName: 'LiloCharge',
            status: StationStatus.AVAILABLE,
          },
        ]);
      }),
    };

    const stationsApi = createStationsApi(apiClientMock as never);

    await expect(
      stationsApi.getNearbyStations({
        availabilityStatuses: [StationStatus.AVAILABLE],
        connectorTypes: [ConnectorType.CCS, ConnectorType.TYPE_2],
        latitude: 40.177,
        limit: 120,
        longitude: 44.511,
        minimumPowerKw: 90,
        operatorIds: ['operator-1', 'operator-2'],
        radiusMeters: 10000,
      }),
    ).resolves.toEqual([
      {
        address: 'Arami 6',
        amenities: ['parking'],
        city: 'Yerevan',
        connectorCount: 2,
        distanceMeters: 320,
        id: '11111111-1111-1111-1111-111111111111',
        latitude: 40.177,
        longitude: 44.511,
        maxPowerKw: 50,
        name: 'Arami Fast Charge',
        openingHours: '24/7',
        operatorId: 'operator-1',
        operatorName: 'LiloCharge',
        status: StationStatus.AVAILABLE,
      },
    ]);

    expect(apiClientMock.get).toHaveBeenCalledWith('/stations/nearby', {
      query: {
        availabilityStatuses: 'AVAILABLE',
        connectorTypes: 'CCS,TYPE_2',
        latitude: 40.177,
        limit: 120,
        longitude: 44.511,
        minimumPowerKw: 90,
        operatorIds: 'operator-1,operator-2',
        radiusMeters: 10000,
      },
    });
  });

  it('requests station detail through the typed API client', async () => {
    const stationId = '11111111-1111-1111-1111-111111111111';
    const apiClientMock = {
      get: jest.fn<Promise<StationDetailResponse>, [string, { query: StationDetailQueryRequest }]>(
        () => {
          return Promise.resolve({
            address: 'Arami 6',
            amenities: ['parking'],
            averageRating: 4.5,
            city: 'Yerevan',
            connectors: [
              {
                connectorType: ConnectorType.CCS,
                createdAt: '2026-02-17T00:00:00.000Z',
                evseId: 'EVA-001',
                id: '22222222-2222-2222-2222-222222222222',
                lastStatusUpdate: '2026-02-17T00:00:00.000Z',
                powerKw: 120,
                stationId,
                status: StationStatus.AVAILABLE,
                updatedAt: '2026-02-17T00:00:00.000Z',
              },
            ],
            createdAt: '2026-02-17T00:00:00.000Z',
            distanceMeters: 320,
            id: stationId,
            latitude: 40.177,
            longitude: 44.511,
            name: 'Arami Fast Charge',
            openingHours: '24/7',
            operatorId: 'operator-1',
            operatorName: 'LiloCharge',
            pricingPlans: [],
            reviewCount: 0,
            reviews: [],
            status: StationStatus.AVAILABLE,
            updatedAt: '2026-02-17T00:00:00.000Z',
          });
        },
      ),
    };

    const stationsApi = createStationsApi(apiClientMock as never);

    await expect(
      stationsApi.getStationDetail(stationId, {
        latitude: 40.177,
        longitude: 44.511,
      }),
    ).resolves.toMatchObject({
      id: stationId,
      name: 'Arami Fast Charge',
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(`/stations/${stationId}`, {
      query: {
        latitude: 40.177,
        longitude: 44.511,
      },
    });
  });

  it('requests fuzzy station search through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn<
        Promise<StationNearbyResponse[]>,
        [string, { query: StationSearchQueryRequest }]
      >(() => {
        return Promise.resolve([
          {
            address: 'Թումանյան 12',
            amenities: ['parking'],
            city: 'Yerevan',
            connectorCount: 2,
            distanceMeters: 430,
            id: '33333333-3333-3333-3333-333333333333',
            latitude: 40.181,
            longitude: 44.52,
            maxPowerKw: 50,
            name: 'Туманян заряд',
            openingHours: '24/7',
            operatorId: 'operator-2',
            operatorName: 'Operator 2',
            status: StationStatus.AVAILABLE,
          },
        ]);
      }),
    };

    const stationsApi = createStationsApi(apiClientMock as never);

    await expect(
      stationsApi.searchStations({
        latitude: 40.1792,
        limit: 15,
        longitude: 44.4991,
        query: 'tuman',
      }),
    ).resolves.toEqual([
      {
        address: 'Թումանյան 12',
        amenities: ['parking'],
        city: 'Yerevan',
        connectorCount: 2,
        distanceMeters: 430,
        id: '33333333-3333-3333-3333-333333333333',
        latitude: 40.181,
        longitude: 44.52,
        maxPowerKw: 50,
        name: 'Туманян заряд',
        openingHours: '24/7',
        operatorId: 'operator-2',
        operatorName: 'Operator 2',
        status: StationStatus.AVAILABLE,
      },
    ]);

    expect(apiClientMock.get).toHaveBeenCalledWith('/stations/search', {
      query: {
        latitude: 40.1792,
        limit: 15,
        longitude: 44.4991,
        query: 'tuman',
      },
    });
  });

  it('requests the most confident community connector status through the typed API client', async () => {
    const connectorId = '22222222-2222-2222-2222-222222222222';
    const communityStatus: MostConfidentStatusResponse = {
      confidenceScore: 0.82,
      connectorId,
      latestUpdate: {
        comment: 'Charger is busy right now',
        confidenceScore: 0.9,
        connectorId,
        createdAt: '2026-07-06T10:00:00.000Z',
        id: '77777777-7777-7777-7777-777777777777',
        status: StationStatus.OCCUPIED,
        updatedAt: '2026-07-06T10:00:00.000Z',
        userId: '88888888-8888-8888-8888-888888888888',
      },
      status: StationStatus.OCCUPIED,
    };
    const apiClientMock = {
      get: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(() => {
        return Promise.resolve(communityStatus);
      }),
    };

    const stationsApi = createStationsApi(apiClientMock as never);

    await expect(stationsApi.getConnectorCommunityStatus(connectorId)).resolves.toEqual(
      communityStatus,
    );

    expect(apiClientMock.get).toHaveBeenCalledWith(
      `/connectors/${connectorId}/most-confident-status`,
    );
  });

  it('submits a community connector status report through the typed API client', async () => {
    const connectorId = '22222222-2222-2222-2222-222222222222';
    const userId = '88888888-8888-8888-8888-888888888888';
    const apiClientMock = {
      post: jest.fn(() => {
        return Promise.resolve({
          comment: null,
          confidenceScore: 1,
          connectorId,
          createdAt: '2026-07-06T10:00:00.000Z',
          id: '99999999-9999-9999-9999-999999999999',
          status: StationStatus.OFFLINE,
          updatedAt: '2026-07-06T10:00:00.000Z',
          userId,
        });
      }),
    };

    const stationsApi = createStationsApi(apiClientMock as never);

    await expect(
      stationsApi.reportConnectorStatus(userId, {
        connectorId,
        status: StationStatus.OFFLINE,
      }),
    ).resolves.toMatchObject({
      connectorId,
      status: StationStatus.OFFLINE,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${userId}/connector-status-updates`, {
      body: {
        connectorId,
        status: StationStatus.OFFLINE,
      },
    });
  });

  it('returns null when a connector has no community status reports', async () => {
    const apiClientMock = {
      get: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(() => {
        return Promise.resolve(null);
      }),
    };

    const stationsApi = createStationsApi(apiClientMock as never);

    await expect(
      stationsApi.getConnectorCommunityStatus('22222222-2222-2222-2222-222222222222'),
    ).resolves.toBeNull();
  });
});
