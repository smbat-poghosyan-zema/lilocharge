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

const ALL_STATIONS: StationNearbyResponse[] = [
  {
    address: 'Arami 6',
    amenities: ['parking'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 320,
    id: 'station-with-ccs-1',
    latitude: 40.177,
    longitude: 44.511,
    maxPowerKw: 50,
    name: 'CCS Fast Station 1',
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    status: StationStatus.AVAILABLE,
  },
  {
    address: 'Tumanyan 12',
    amenities: ['wc'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 760,
    id: 'station-with-type2-1',
    latitude: 40.181,
    longitude: 44.52,
    maxPowerKw: 50,
    name: 'Type2 AC Station',
    openingHours: '09:00-22:00',
    operatorId: 'operator-2',
    operatorName: 'Operator 2',
    status: StationStatus.OCCUPIED,
  },
  {
    address: 'Mashtots 35',
    amenities: ['parking', 'cafe'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 580,
    id: 'station-with-ccs-2',
    latitude: 40.185,
    longitude: 44.515,
    maxPowerKw: 50,
    name: 'CCS Fast Station 2',
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    status: StationStatus.AVAILABLE,
  },
  {
    address: 'Abovyan 3',
    amenities: ['shop'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 920,
    id: 'station-with-chademo-1',
    latitude: 40.19,
    longitude: 44.525,
    maxPowerKw: 50,
    name: 'CHAdeMO Station',
    openingHours: '08:00-20:00',
    operatorId: 'operator-3',
    operatorName: 'Operator 3',
    status: StationStatus.MAINTENANCE,
  },
];

const CCS_FILTERED_STATIONS: StationNearbyResponse[] = [ALL_STATIONS[0], ALL_STATIONS[2]];

const STATION_DETAIL_CCS_1: StationDetailResponse = {
  address: 'Arami 6',
  amenities: ['parking'],
  averageRating: 4.5,
  city: 'Yerevan',
  connectors: [
    {
      connectorType: ConnectorType.CCS,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-001',
      id: 'connector-ccs-1',
      lastStatusUpdate: '2026-02-17T00:00:00.000Z',
      powerKw: 150,
      stationId: 'station-with-ccs-1',
      status: StationStatus.AVAILABLE,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
  ],
  createdAt: '2026-02-17T00:00:00.000Z',
  distanceMeters: 320,
  id: 'station-with-ccs-1',
  latitude: 40.177,
  longitude: 44.511,
  name: 'CCS Fast Station 1',
  openingHours: '24/7',
  operatorId: 'operator-1',
  operatorName: 'LiloCharge',
  pricingPlans: [],
  reviewCount: 0,
  reviews: [],
  status: StationStatus.AVAILABLE,
  updatedAt: '2026-02-17T00:00:00.000Z',
};

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

/**
 * Builds a stations API mock that simulates filtering behavior.
 */
function createStationsApiClientMock(): StationsApiClientMock {
  return {
    getNearbyStations: jest.fn<Promise<StationNearbyResponse[]>, [NearbyStationsQueryRequest]>(
      (request) => {
        if (request.connectorTypes?.includes(ConnectorType.CCS)) {
          return Promise.resolve([...CCS_FILTERED_STATIONS]);
        }
        return Promise.resolve([...ALL_STATIONS]);
      },
    ),
    searchStations: jest.fn<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>(() => {
      return Promise.resolve([]);
    }),
    getStationDetail: jest.fn<Promise<StationDetailResponse>, [string, StationDetailQueryRequest]>(
      () => {
        return Promise.resolve(STATION_DETAIL_CCS_1);
      },
    ),
  };
}

describe('Station Discovery Integration', () => {
  describe('Given the user loads the stations map', () => {
    it('When the map loads, Then all nearby stations appear on the map', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations).toHaveBeenCalledWith({
          availabilityStatuses: undefined,
          connectorTypes: undefined,
          latitude: 40.1792,
          limit: 100,
          longitude: 44.4991,
          minimumPowerKw: undefined,
          operatorIds: undefined,
          radiusMeters: 25000,
        });
      });

      expect(screen.getByTestId('station-shape-source')).toBeTruthy();
    });

    it('When the user filters by CCS connector type, Then only CCS stations are shown', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations).toHaveBeenCalledWith(
          expect.objectContaining({
            latitude: 40.1792,
            longitude: 44.4991,
          }),
        );
      });

      fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith({
          availabilityStatuses: undefined,
          connectorTypes: [ConnectorType.CCS],
          latitude: 40.1792,
          limit: 100,
          longitude: 44.4991,
          minimumPowerKw: undefined,
          operatorIds: undefined,
          radiusMeters: 25000,
        });
      });
    });

    it('When the user selects a CCS-filtered station, Then the station details are loaded and displayed', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
          expect.objectContaining({
            connectorTypes: [ConnectorType.CCS],
          }),
        );
      });

      fireEvent(screen.getByTestId('station-shape-source'), 'press', {
        features: [
          {
            properties: {
              id: 'station-with-ccs-1',
            },
            type: 'Feature',
          },
        ],
      } as never);

      const bottomSheet: unknown = await screen.findByTestId('station-bottom-sheet');
      expect(bottomSheet).toBeTruthy();

      await waitFor(() => {
        expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith('station-with-ccs-1', {
          connectorTypes: [ConnectorType.CCS],
          latitude: 40.1792,
          longitude: 44.4991,
          minimumPowerKw: undefined,
        });
      });

      expect(await screen.findByTestId('station-connector-card-connector-ccs-1')).toBeTruthy();
    });
  });

  describe('Given the user applies multiple filters', () => {
    it('When CCS connector and AVAILABLE status filters are applied, Then stations matching both criteria are shown', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));
      fireEvent.press(screen.getByTestId('station-filter-availability-AVAILABLE'));

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith({
          availabilityStatuses: [StationStatus.AVAILABLE],
          connectorTypes: [ConnectorType.CCS],
          latitude: 40.1792,
          limit: 100,
          longitude: 44.4991,
          minimumPowerKw: undefined,
          operatorIds: undefined,
          radiusMeters: 25000,
        });
      });
    });

    it('When all filter types are applied, Then the API is called with complete filter criteria', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));
      fireEvent.press(screen.getByTestId('station-filter-power-step-120'));
      fireEvent.press(screen.getByTestId('station-filter-availability-AVAILABLE'));
      fireEvent.press(screen.getByTestId('station-filter-operator-operator-1'));

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith({
          availabilityStatuses: [StationStatus.AVAILABLE],
          connectorTypes: [ConnectorType.CCS],
          latitude: 40.1792,
          limit: 100,
          longitude: 44.4991,
          minimumPowerKw: 120,
          operatorIds: ['operator-1'],
          radiusMeters: 25000,
        });
      });
    });
  });

  describe('Given the user wants to search for stations', () => {
    it('When a search query is entered, Then the search API is called instead of nearby stations', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      fireEvent.changeText(screen.getByTestId('station-search-input'), 'CCS Fast');

      await waitFor(
        () => {
          expect(stationsApiClient.searchStations).toHaveBeenCalledWith({
            latitude: 40.1792,
            limit: 20,
            longitude: 44.4991,
            query: 'CCS Fast',
          });
        },
        { timeout: 1000 },
      );
    });

    it('When search query is cleared, Then nearby stations API is called again', async () => {
      const stationsApiClient = createStationsApiClientMock();

      render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

      await screen.findByTestId('stations-map');

      const initialCallCount = stationsApiClient.getNearbyStations.mock.calls.length;

      fireEvent.changeText(screen.getByTestId('station-search-input'), 'test');

      await waitFor(() => {
        expect(stationsApiClient.searchStations).toHaveBeenCalled();
      });

      fireEvent.changeText(screen.getByTestId('station-search-input'), '');

      await waitFor(() => {
        expect(stationsApiClient.getNearbyStations.mock.calls.length).toBeGreaterThan(
          initialCallCount,
        );
      });
    });
  });

  describe('Given the user wants to recenter the map', () => {
    it('When the recenter button is pressed, Then the camera returns to default position', async () => {
      const stationsApiClient = createStationsApiClientMock();
      const rendered = render(
        <StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />,
      );

      await screen.findByTestId('stations-map');

      fireEvent(screen.getByTestId('station-shape-source'), 'press', {
        features: [
          {
            properties: {
              id: 'station-with-ccs-1',
            },
            type: 'Feature',
          },
        ],
      } as never);

      await waitFor(() => {
        expect(rendered.UNSAFE_getByProps({ zoomLevel: 14 })).toHaveProp(
          'centerCoordinate',
          [44.511, 40.177],
        );
      });

      fireEvent.press(screen.getByTestId('station-recenter-camera-button'));

      await waitFor(() => {
        expect(rendered.UNSAFE_getByProps({ zoomLevel: 12 })).toHaveProp(
          'centerCoordinate',
          [44.4991, 40.1792],
        );
      });
    });

    it('When a station is selected and focus button is pressed, Then camera zooms to station location', async () => {
      const stationsApiClient = createStationsApiClientMock();
      const rendered = render(
        <StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />,
      );

      await screen.findByTestId('stations-map');

      fireEvent(screen.getByTestId('station-shape-source'), 'press', {
        features: [
          {
            properties: {
              id: 'station-with-ccs-1',
            },
            type: 'Feature',
          },
        ],
      } as never);

      await screen.findByTestId('station-bottom-sheet');

      fireEvent.press(screen.getByTestId('station-focus-camera-button'));

      await waitFor(() => {
        expect(rendered.UNSAFE_getByProps({ zoomLevel: 14 })).toHaveProp(
          'centerCoordinate',
          [44.511, 40.177],
        );
        expect(rendered.UNSAFE_getByProps({ zoomLevel: 14 })).toHaveProp('zoomLevel', 14);
      });
    });
  });
});
