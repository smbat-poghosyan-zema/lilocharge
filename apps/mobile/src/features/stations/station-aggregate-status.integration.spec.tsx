import type {
  NearbyStationsQueryRequest,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { StationsScreen } from './stations-screen';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

interface StationsApiClientMock {
  readonly getNearbyStations: jest.Mock<
    Promise<StationNearbyResponse[]>,
    [NearbyStationsQueryRequest]
  >;
  readonly searchStations: jest.Mock<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>;
  readonly getStationDetail: jest.Mock<
    Promise<StationDetailResponse>,
    [string, StationDetailQueryRequest]
  >;
}

const STATION_WITH_AVAILABLE: StationNearbyResponse = {
  address: 'Arami 6',
  amenities: ['parking'],
  city: 'Yerevan',
  connectorCount: 3,
  distanceMeters: 320,
  id: 'station-aggregate-1',
  latitude: 40.177,
  longitude: 44.511,
  maxPowerKw: 120,
  name: 'Mixed Connectors Station',
  openingHours: '24/7',
  operatorId: 'operator-1',
  operatorName: 'LiloCharge',
  status: StationStatus.AVAILABLE,
};

const STATION_ALL_OCCUPIED: StationNearbyResponse = {
  address: 'Tumanyan 12',
  amenities: ['wc'],
  city: 'Yerevan',
  connectorCount: 2,
  distanceMeters: 760,
  id: 'station-aggregate-2',
  latitude: 40.181,
  longitude: 44.52,
  maxPowerKw: 50,
  name: 'All Occupied Station',
  openingHours: '09:00-22:00',
  operatorId: 'operator-2',
  operatorName: 'Operator 2',
  status: StationStatus.OCCUPIED,
};

const STATION_ALL_OFFLINE: StationNearbyResponse = {
  address: 'Mashtots 35',
  amenities: [],
  city: 'Yerevan',
  connectorCount: 2,
  distanceMeters: 1200,
  id: 'station-aggregate-3',
  latitude: 40.185,
  longitude: 44.515,
  maxPowerKw: 22,
  name: 'All Offline Station',
  openingHours: null,
  operatorId: 'operator-3',
  operatorName: 'Operator 3',
  status: StationStatus.OFFLINE,
};

const DETAIL_AVAILABLE: StationDetailResponse = {
  address: STATION_WITH_AVAILABLE.address,
  amenities: STATION_WITH_AVAILABLE.amenities,
  averageRating: null,
  city: STATION_WITH_AVAILABLE.city,
  connectors: [
    {
      connectorType: ConnectorType.CCS,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-001',
      id: 'connector-avail-1',
      lastStatusUpdate: '2026-02-17T00:00:00.000Z',
      powerKw: 120,
      stationId: STATION_WITH_AVAILABLE.id,
      status: StationStatus.AVAILABLE,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
    {
      connectorType: ConnectorType.TYPE_2,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-002',
      id: 'connector-occ-1',
      lastStatusUpdate: '2026-02-17T00:00:00.000Z',
      powerKw: 22,
      stationId: STATION_WITH_AVAILABLE.id,
      status: StationStatus.OCCUPIED,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
    {
      connectorType: ConnectorType.TYPE_2,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-003',
      id: 'connector-occ-2',
      lastStatusUpdate: '2026-02-17T00:00:00.000Z',
      powerKw: 22,
      stationId: STATION_WITH_AVAILABLE.id,
      status: StationStatus.OCCUPIED,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
  ],
  createdAt: '2026-02-17T00:00:00.000Z',
  distanceMeters: 320,
  id: STATION_WITH_AVAILABLE.id,
  latitude: STATION_WITH_AVAILABLE.latitude,
  longitude: STATION_WITH_AVAILABLE.longitude,
  name: STATION_WITH_AVAILABLE.name,
  openingHours: STATION_WITH_AVAILABLE.openingHours,
  operatorId: STATION_WITH_AVAILABLE.operatorId,
  operatorName: STATION_WITH_AVAILABLE.operatorName,
  pricingPlans: [],
  reviewCount: 0,
  reviews: [],
  status: StationStatus.AVAILABLE,
  updatedAt: '2026-02-17T00:00:00.000Z',
};

function createStationsApiClientMock(
  stations: StationNearbyResponse[],
  detail: StationDetailResponse,
): StationsApiClientMock {
  return {
    getNearbyStations: jest.fn<Promise<StationNearbyResponse[]>, [NearbyStationsQueryRequest]>(() =>
      Promise.resolve([...stations]),
    ),
    searchStations: jest.fn<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>(() =>
      Promise.resolve([]),
    ),
    getStationDetail: jest.fn<Promise<StationDetailResponse>, [string, StationDetailQueryRequest]>(
      () => Promise.resolve(detail),
    ),
  };
}

describe('A1 — Aggregate status display on map pins', () => {
  it('Given a station with 1 AVAILABLE + 2 OCCUPIED connectors, Then the map pin shows AVAILABLE', async () => {
    const stationsApiClient = createStationsApiClientMock(
      [STATION_WITH_AVAILABLE],
      DETAIL_AVAILABLE,
    );

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    expect(screen.getByTestId('station-shape-source')).toBeTruthy();

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION_WITH_AVAILABLE.id },
          type: 'Feature',
        },
      ],
    } as never);

    expect(await screen.findByTestId('station-bottom-sheet')).toBeTruthy();

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(
        STATION_WITH_AVAILABLE.id,
        expect.objectContaining({
          latitude: 40.1792,
          longitude: 44.4991,
        }),
      );
    });

    expect(await screen.findByTestId('station-connector-card-connector-avail-1')).toBeTruthy();
    expect(await screen.findByTestId('station-connector-card-connector-occ-1')).toBeTruthy();
    expect(await screen.findByTestId('station-connector-card-connector-occ-2')).toBeTruthy();
  });

  it('Given a station with 0 AVAILABLE + 2 OCCUPIED connectors, Then the station status is OCCUPIED', async () => {
    const occupiedDetail: StationDetailResponse = {
      ...DETAIL_AVAILABLE,
      id: STATION_ALL_OCCUPIED.id,
      name: STATION_ALL_OCCUPIED.name,
      status: StationStatus.OCCUPIED,
      connectors: [
        {
          connectorType: ConnectorType.CCS,
          createdAt: '2026-02-17T00:00:00.000Z',
          evseId: 'EVB-001',
          id: 'connector-occ-a',
          lastStatusUpdate: '2026-02-17T00:00:00.000Z',
          powerKw: 50,
          stationId: STATION_ALL_OCCUPIED.id,
          status: StationStatus.OCCUPIED,
          updatedAt: '2026-02-17T00:00:00.000Z',
        },
        {
          connectorType: ConnectorType.CCS,
          createdAt: '2026-02-17T00:00:00.000Z',
          evseId: 'EVB-002',
          id: 'connector-occ-b',
          lastStatusUpdate: '2026-02-17T00:00:00.000Z',
          powerKw: 50,
          stationId: STATION_ALL_OCCUPIED.id,
          status: StationStatus.OCCUPIED,
          updatedAt: '2026-02-17T00:00:00.000Z',
        },
      ],
    };

    const stationsApiClient = createStationsApiClientMock([STATION_ALL_OCCUPIED], occupiedDetail);

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION_ALL_OCCUPIED.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(
        STATION_ALL_OCCUPIED.id,
        expect.anything(),
      );
    });

    expect(await screen.findByTestId('station-connector-card-connector-occ-a')).toBeTruthy();
    expect(await screen.findByTestId('station-connector-card-connector-occ-b')).toBeTruthy();
  });

  it('Given all connectors OFFLINE, Then the station status is OFFLINE', async () => {
    const offlineDetail: StationDetailResponse = {
      ...DETAIL_AVAILABLE,
      id: STATION_ALL_OFFLINE.id,
      name: STATION_ALL_OFFLINE.name,
      status: StationStatus.OFFLINE,
      connectors: [
        {
          connectorType: ConnectorType.TYPE_2,
          createdAt: '2026-02-17T00:00:00.000Z',
          evseId: 'EVC-001',
          id: 'connector-off-a',
          lastStatusUpdate: '2026-02-17T00:00:00.000Z',
          powerKw: 22,
          stationId: STATION_ALL_OFFLINE.id,
          status: StationStatus.OFFLINE,
          updatedAt: '2026-02-17T00:00:00.000Z',
        },
        {
          connectorType: ConnectorType.TYPE_2,
          createdAt: '2026-02-17T00:00:00.000Z',
          evseId: 'EVC-002',
          id: 'connector-off-b',
          lastStatusUpdate: '2026-02-17T00:00:00.000Z',
          powerKw: 22,
          stationId: STATION_ALL_OFFLINE.id,
          status: StationStatus.OFFLINE,
          updatedAt: '2026-02-17T00:00:00.000Z',
        },
      ],
    };

    const stationsApiClient = createStationsApiClientMock([STATION_ALL_OFFLINE], offlineDetail);

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION_ALL_OFFLINE.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(
        STATION_ALL_OFFLINE.id,
        expect.anything(),
      );
    });

    expect(await screen.findByTestId('station-connector-card-connector-off-a')).toBeTruthy();
    expect(await screen.findByTestId('station-connector-card-connector-off-b')).toBeTruthy();
  });
});

describe('A2 — Filter-aware connector display in bottom sheet', () => {
  const STATION: StationNearbyResponse = {
    address: 'Arami 6',
    amenities: ['parking'],
    city: 'Yerevan',
    connectorCount: 3,
    distanceMeters: 320,
    id: 'station-filter-detail-1',
    latitude: 40.177,
    longitude: 44.511,
    maxPowerKw: 150,
    name: 'Filtered Station',
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    status: StationStatus.AVAILABLE,
  };

  const HIGH_POWER_CONNECTOR_ID = 'connector-high-power';
  const LOW_POWER_CONNECTOR_ID_1 = 'connector-low-power-1';
  const LOW_POWER_CONNECTOR_ID_2 = 'connector-low-power-2';

  const DETAIL_ALL_CONNECTORS: StationDetailResponse = {
    address: STATION.address,
    amenities: STATION.amenities,
    averageRating: null,
    city: STATION.city,
    connectors: [
      {
        connectorType: ConnectorType.CCS,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVD-001',
        id: HIGH_POWER_CONNECTOR_ID,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 150,
        stationId: STATION.id,
        status: StationStatus.AVAILABLE,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
      {
        connectorType: ConnectorType.TYPE_2,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVD-002',
        id: LOW_POWER_CONNECTOR_ID_1,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 22,
        stationId: STATION.id,
        status: StationStatus.AVAILABLE,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
      {
        connectorType: ConnectorType.TYPE_2,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVD-003',
        id: LOW_POWER_CONNECTOR_ID_2,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 22,
        stationId: STATION.id,
        status: StationStatus.OCCUPIED,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
    ],
    createdAt: '2026-02-17T00:00:00.000Z',
    distanceMeters: 320,
    id: STATION.id,
    latitude: STATION.latitude,
    longitude: STATION.longitude,
    name: STATION.name,
    openingHours: STATION.openingHours,
    operatorId: STATION.operatorId,
    operatorName: STATION.operatorName,
    pricingPlans: [],
    reviewCount: 0,
    reviews: [],
    status: StationStatus.AVAILABLE,
    updatedAt: '2026-02-17T00:00:00.000Z',
  };

  const DETAIL_FILTERED_CONNECTORS: StationDetailResponse = {
    ...DETAIL_ALL_CONNECTORS,
    connectors: [DETAIL_ALL_CONNECTORS.connectors[0]],
  };

  it('When no filter is active, Then all connectors are shown', async () => {
    const stationsApiClient = createStationsApiClientMock([STATION], DETAIL_ALL_CONNECTORS);

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalled();
    });

    expect(
      await screen.findByTestId(`station-connector-card-${HIGH_POWER_CONNECTOR_ID}`),
    ).toBeTruthy();
    expect(screen.getByTestId(`station-connector-card-${LOW_POWER_CONNECTOR_ID_1}`)).toBeTruthy();
    expect(screen.getByTestId(`station-connector-card-${LOW_POWER_CONNECTOR_ID_2}`)).toBeTruthy();
  });

  it('When minimumPowerKw filter is active, Then the API returns only matching connectors', async () => {
    const stationsApiClient: StationsApiClientMock = {
      getNearbyStations: jest.fn<Promise<StationNearbyResponse[]>, [NearbyStationsQueryRequest]>(
        () => Promise.resolve([STATION]),
      ),
      searchStations: jest.fn<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>(() =>
        Promise.resolve([]),
      ),
      getStationDetail: jest.fn<
        Promise<StationDetailResponse>,
        [string, StationDetailQueryRequest]
      >(() => Promise.resolve(DETAIL_FILTERED_CONNECTORS)),
    };

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByTestId('station-filter-power-step-120'));

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          minimumPowerKw: 120,
        }),
      );
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(
        STATION.id,
        expect.objectContaining({
          minimumPowerKw: 120,
        }),
      );
    });

    expect(
      await screen.findByTestId(`station-connector-card-${HIGH_POWER_CONNECTOR_ID}`),
    ).toBeTruthy();
  });

  it('When filter is active, Then the "Filtered connectors" badge is visible', async () => {
    const stationsApiClient: StationsApiClientMock = {
      getNearbyStations: jest.fn<Promise<StationNearbyResponse[]>, [NearbyStationsQueryRequest]>(
        () => Promise.resolve([STATION]),
      ),
      searchStations: jest.fn<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>(() =>
        Promise.resolve([]),
      ),
      getStationDetail: jest.fn<
        Promise<StationDetailResponse>,
        [string, StationDetailQueryRequest]
      >(() => Promise.resolve(DETAIL_FILTERED_CONNECTORS)),
    };

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByTestId('station-filter-power-step-120'));

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
        expect.objectContaining({ minimumPowerKw: 120 }),
      );
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalled();
    });

    expect(screen.getByTestId('station-bottom-sheet-filtered-badge')).toBeTruthy();
  });

  it('When filter is inactive, Then the "Filtered connectors" badge is NOT visible', async () => {
    const stationsApiClient = createStationsApiClientMock([STATION], DETAIL_ALL_CONNECTORS);

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('station-bottom-sheet-filtered-badge')).toBeNull();
  });
});

describe('A3 — Collapsible filter panel', () => {
  function createBasicApiMock(): StationsApiClientMock {
    return createStationsApiClientMock(
      [STATION_WITH_AVAILABLE, STATION_ALL_OCCUPIED],
      DETAIL_AVAILABLE,
    );
  }

  it('On mount, the filter panel is NOT visible (isFiltersVisible: false)', async () => {
    const stationsApiClient = createBasicApiMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    expect(screen.queryByTestId('station-filter-active-dot')).toBeNull();
  });

  it('Pressing the toggle button shows the filter panel, pressing again hides it', async () => {
    const stationsApiClient = createBasicApiMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByTestId('station-filter-toggle-button'));

    expect(screen.getByTestId('station-filter-container')).toBeTruthy();

    fireEvent.press(screen.getByTestId('station-filter-toggle-button'));

    expect(screen.getByTestId('station-filter-container')).toBeTruthy();
  });

  it('When filters are active and panel is hidden, the green dot badge is visible', async () => {
    const stationsApiClient = createBasicApiMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByTestId('station-filter-toggle-button'));

    fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));

    fireEvent.press(screen.getByTestId('station-filter-toggle-button'));

    expect(screen.getByTestId('station-filter-active-dot')).toBeTruthy();
  });

  it('When no filters are active, the green dot badge is NOT visible', async () => {
    const stationsApiClient = createBasicApiMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    expect(screen.queryByTestId('station-filter-active-dot')).toBeNull();
  });
});

describe('A4 — Filter context passed to API', () => {
  it('When stationFilters.minimumPowerKw is set and a station is selected, the API call includes minimumPowerKw', async () => {
    const stationsApiClient = createStationsApiClientMock(
      [STATION_WITH_AVAILABLE],
      DETAIL_AVAILABLE,
    );

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByTestId('station-filter-power-step-50'));

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
        expect.objectContaining({ minimumPowerKw: 50 }),
      );
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION_WITH_AVAILABLE.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(
        STATION_WITH_AVAILABLE.id,
        expect.objectContaining({
          minimumPowerKw: 50,
        }),
      );
    });
  });

  it('When stationFilters changes while a station is selected, getStationDetail is re-called', async () => {
    const stationsApiClient = createStationsApiClientMock(
      [STATION_WITH_AVAILABLE],
      DETAIL_AVAILABLE,
    );

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: { id: STATION_WITH_AVAILABLE.id },
          type: 'Feature',
        },
      ],
    } as never);

    await screen.findByTestId('station-bottom-sheet');

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledTimes(2);
    });

    expect(stationsApiClient.getStationDetail).toHaveBeenLastCalledWith(
      STATION_WITH_AVAILABLE.id,
      expect.objectContaining({
        connectorTypes: [ConnectorType.CCS],
      }),
    );
  });
});
