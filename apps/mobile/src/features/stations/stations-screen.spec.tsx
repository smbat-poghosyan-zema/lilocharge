import type {
  FavoriteStation,
  NearbyStationsQueryRequest,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationSearchQueryRequest,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { StationsScreen } from './stations-screen';
import type { FavoritesStorage } from '../favorites/favorites-storage';
import type { FavoritesSync, FavoritesSyncResult } from '../favorites/favorites-sync';

const mockPush = jest.fn<void, [string]>();
const requestForegroundPermissionsAsyncMock = jest.mocked(
  Location.requestForegroundPermissionsAsync,
);
const getCurrentPositionAsyncMock = jest.mocked(Location.getCurrentPositionAsync);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const STATIONS: readonly StationNearbyResponse[] = [
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
  {
    address: 'Tumanyan 12',
    amenities: ['wc'],
    city: 'Yerevan',
    connectorCount: 2,
    distanceMeters: 760,
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    latitude: 40.181,
    longitude: 44.52,
    maxPowerKw: 50,
    name: 'Tumanyan AC',
    openingHours: '09:00-22:00',
    operatorId: 'operator-2',
    operatorName: 'Operator 2',
    status: StationStatus.OCCUPIED,
  },
];

const STATION_DETAIL: StationDetailResponse = {
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
      stationId: STATIONS[0].id,
      status: StationStatus.AVAILABLE,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
  ],
  createdAt: '2026-02-17T00:00:00.000Z',
  distanceMeters: 320,
  id: STATIONS[0].id,
  latitude: STATIONS[0].latitude,
  longitude: STATIONS[0].longitude,
  name: STATIONS[0].name,
  openingHours: STATIONS[0].openingHours,
  operatorId: STATIONS[0].operatorId,
  operatorName: STATIONS[0].operatorName,
  pricingPlans: [],
  reviewCount: 0,
  reviews: [],
  status: STATIONS[0].status,
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

interface FavoritesStorageMock {
  readonly clearFavoriteStations: jest.Mock<void, []>;
  readonly isFavoriteStation: jest.Mock<boolean, [string]>;
  readonly listFavoriteStations: jest.Mock<readonly FavoriteStation[], []>;
  readonly removeFavoriteStation: jest.Mock<readonly FavoriteStation[], [string]>;
  readonly saveFavoriteStation: jest.Mock<readonly FavoriteStation[], [StationNearbyResponse]>;
  readonly setFavoriteStations: jest.Mock<readonly FavoriteStation[], [readonly FavoriteStation[]]>;
  readonly subscribe: jest.Mock<() => void, [() => void]>;
}

/**
 * Builds a stations API mock implementing both nearby and detail station calls.
 */
function createStationsApiClientMock(): StationsApiClientMock {
  return {
    getNearbyStations: jest.fn<Promise<StationNearbyResponse[]>, [NearbyStationsQueryRequest]>(
      () => {
        return Promise.resolve([...STATIONS]);
      },
    ),
    searchStations: jest.fn<Promise<StationNearbyResponse[]>, [StationSearchQueryRequest]>(() => {
      return Promise.resolve(STATIONS[1] ? [STATIONS[1]] : []);
    }),
    getStationDetail: jest.fn<Promise<StationDetailResponse>, [string, StationDetailQueryRequest]>(
      () => {
        return Promise.resolve(STATION_DETAIL);
      },
    ),
  };
}

/**
 * Builds a favorites-storage mock for station favorite toggle tests.
 */
function createFavoritesStorageMock(
  options: { readonly isFavorite?: boolean } = {},
): FavoritesStorageMock {
  const isFavorite = options.isFavorite ?? false;
  const favorites = isFavorite ? [buildFavoriteStation()] : [];

  return {
    clearFavoriteStations: jest.fn<void, []>(),
    isFavoriteStation: jest.fn<boolean, [string]>(() => isFavorite),
    listFavoriteStations: jest.fn<readonly FavoriteStation[], []>(() => favorites),
    removeFavoriteStation: jest.fn<readonly FavoriteStation[], [string]>(() => []),
    saveFavoriteStation: jest.fn<readonly FavoriteStation[], [StationNearbyResponse]>(
      () => favorites,
    ),
    setFavoriteStations: jest.fn<readonly FavoriteStation[], [readonly FavoriteStation[]]>(
      (nextFavorites) => {
        return nextFavorites;
      },
    ),
    subscribe: jest.fn<() => void, [() => void]>(() => {
      return (): void => {
        return;
      };
    }),
  };
}

/**
 * Builds one foreground location-permission response fixture with the provided grant flag.
 */
function buildLocationPermission(granted: boolean): Location.LocationPermissionResponse {
  return {
    canAskAgain: true,
    expires: 'never',
    granted,
    status: granted ? 'granted' : 'denied',
  } as Location.LocationPermissionResponse;
}

/**
 * Builds one minimal device-position fixture for the provided coordinates.
 */
function buildLocationPosition(latitude: number, longitude: number): Location.LocationObject {
  return {
    coords: {
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude,
      longitude,
      speed: null,
    },
    timestamp: Date.now(),
  } as Location.LocationObject;
}

/** Builds one favorite-station fixture for favorites toggle behavior tests. */
function buildFavoriteStation(): FavoriteStation {
  return {
    createdAt: '2026-02-17T00:00:00.000Z',
    station: {
      address: STATIONS[0]?.address ?? '',
      amenities: STATIONS[0]?.amenities ?? [],
      city: STATIONS[0]?.city ?? '',
      id: STATIONS[0]?.id ?? '',
      latitude: STATIONS[0]?.latitude ?? 0,
      longitude: STATIONS[0]?.longitude ?? 0,
      name: STATIONS[0]?.name ?? '',
      openingHours: STATIONS[0]?.openingHours ?? null,
      operatorId: STATIONS[0]?.operatorId ?? '',
      operatorName: STATIONS[0]?.operatorName ?? '',
      status: STATIONS[0]?.status ?? StationStatus.AVAILABLE,
    },
    stationId: STATIONS[0]?.id ?? '',
  };
}

describe('StationsScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    requestForegroundPermissionsAsyncMock.mockResolvedValue(buildLocationPermission(false));
    getCurrentPositionAsyncMock.mockRejectedValue(new Error('location unavailable in tests'));
  });

  it('renders Armenian map title and subtitle', () => {
    render(<StationsScreen />);

    expect(screen.getByRole('header', { name: 'Լիցքավորման կայաններ' })).toBeTruthy();
    expect(screen.getByText('Գտեք մոտակա կայանները և ստուգեք հասանելիությունը:')).toBeTruthy();
  });

  it('shows missing-token guidance when Mapbox token is not configured', () => {
    render(<StationsScreen />);

    expect(
      screen.getByText(
        'Քարտեզը հասանելի չէ: Սահմանեք EXPO_PUBLIC_MAPBOX_TOKEN միջավայրի փոփոխականը։',
      ),
    ).toBeTruthy();
  });

  it('renders map view and offline controls when token exists', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    expect(await screen.findByTestId('stations-map')).toBeTruthy();
    expect(screen.getByText('Ներբեռնել offline քարտեզ')).toBeTruthy();
  });

  it('opens and closes station bottom sheet when marker is tapped', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: {
            id: STATIONS[0]?.id,
          },
          type: 'Feature',
        },
      ],
    });

    expect(await screen.findByTestId('station-bottom-sheet')).toBeTruthy();

    expect(
      within(screen.getByTestId('station-bottom-sheet')).getByText('Arami Fast Charge'),
    ).toBeTruthy();
    expect(
      await screen.findByTestId('station-connector-card-22222222-2222-2222-2222-222222222222'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('station-bottom-sheet-close-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('station-bottom-sheet')).toBeNull();
    });
  });

  it('updates map camera when focusing selected station and recentering map', async () => {
    const stationsApiClient = createStationsApiClientMock();
    const rendered = render(
      <StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />,
    );

    await screen.findByTestId('stations-map');

    expect(rendered.UNSAFE_getByProps({ zoomLevel: 12 })).toHaveProp(
      'centerCoordinate',
      [44.4991, 40.1792],
    );
    expect(rendered.UNSAFE_getByProps({ zoomLevel: 12 })).toHaveProp('zoomLevel', 12);

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: {
            id: STATIONS[0]?.id,
          },
          type: 'Feature',
        },
      ],
    });

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(STATIONS[0]?.id, {
        latitude: 40.1792,
        longitude: 44.4991,
      });
    });

    fireEvent.press(screen.getByTestId('station-focus-camera-button'));

    expect(rendered.UNSAFE_getByProps({ zoomLevel: 14 })).toHaveProp(
      'centerCoordinate',
      [44.511, 40.177],
    );
    expect(rendered.UNSAFE_getByProps({ zoomLevel: 14 })).toHaveProp('zoomLevel', 14);

    fireEvent.press(screen.getByTestId('station-recenter-camera-button'));

    expect(rendered.UNSAFE_getByProps({ zoomLevel: 12 })).toHaveProp(
      'centerCoordinate',
      [44.4991, 40.1792],
    );
    expect(rendered.UNSAFE_getByProps({ zoomLevel: 12 })).toHaveProp('zoomLevel', 12);
  });

  it('loads station detail and navigates to station detail route', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: {
            id: STATIONS[0]?.id,
          },
          type: 'Feature',
        },
      ],
    });

    await waitFor(() => {
      expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(STATIONS[0]?.id, {
        latitude: 40.1792,
        longitude: 44.4991,
      });
    });

    fireEvent.press(screen.getByTestId('station-bottom-sheet-detail-button'));

    expect(mockPush).toHaveBeenCalledWith(`/stations/${STATIONS[0]?.id}`);
  });

  it('applies station filter controls to nearby query payload', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByTestId('station-filter-connector-CCS'));
    fireEvent.press(screen.getByTestId('station-filter-power-step-120'));
    fireEvent.press(screen.getByTestId('station-filter-availability-AVAILABLE'));
    fireEvent.press(screen.getByTestId('station-filter-operator-operator-2'));

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith({
        availabilityStatuses: [StationStatus.AVAILABLE],
        connectorTypes: [ConnectorType.CCS],
        latitude: 40.1792,
        limit: 100,
        longitude: 44.4991,
        minimumPowerKw: 120,
        operatorIds: ['operator-2'],
        radiusMeters: 25000,
      });
    });
  });

  it('debounces station search input and calls fuzzy search endpoint', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.changeText(screen.getByTestId('station-search-input'), 'туман');

    expect(stationsApiClient.searchStations).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(stationsApiClient.searchStations).toHaveBeenLastCalledWith({
        latitude: 40.1792,
        limit: 20,
        longitude: 44.4991,
        query: 'туман',
      });
    });
  });

  it('saves station to favorites when favorite toggle is pressed for a non-favorited station', async () => {
    const stationsApiClient = createStationsApiClientMock();
    const favoritesStorageMock = createFavoritesStorageMock();

    render(
      <StationsScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
        mapboxToken="pk.test.token"
        stationsApiClient={stationsApiClient}
      />,
    );

    await screen.findByTestId('stations-map');

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: {
            id: STATIONS[0]?.id,
          },
          type: 'Feature',
        },
      ],
    });

    fireEvent.press(await screen.findByTestId('station-bottom-sheet-favorite-button'));

    expect(favoritesStorageMock.saveFavoriteStation).toHaveBeenCalledWith(STATIONS[0]);
    expect(favoritesStorageMock.removeFavoriteStation).not.toHaveBeenCalled();
  });

  it('removes station from favorites when favorite toggle is pressed for an already favorited station', async () => {
    const stationsApiClient = createStationsApiClientMock();
    const favoritesStorageMock = createFavoritesStorageMock({ isFavorite: true });

    render(
      <StationsScreen
        favoritesStorageClient={favoritesStorageMock as unknown as FavoritesStorage}
        mapboxToken="pk.test.token"
        stationsApiClient={stationsApiClient}
      />,
    );

    await screen.findByTestId('stations-map');

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: {
            id: STATIONS[0]?.id,
          },
          type: 'Feature',
        },
      ],
    });

    fireEvent.press(await screen.findByTestId('station-bottom-sheet-favorite-button'));

    expect(favoritesStorageMock.removeFavoriteStation).toHaveBeenCalledWith(STATIONS[0]?.id);
    expect(favoritesStorageMock.saveFavoriteStation).not.toHaveBeenCalled();
  });

  it('shows a localized favorites sync error when the server toggle fails', async () => {
    const stationsApiClient = createStationsApiClientMock();
    const favoritesSyncMock = {
      refreshFromServer: jest.fn<Promise<FavoritesSyncResult>, []>(() => {
        return Promise.resolve({ status: 'SYNCED' });
      }),
      removeFavorite: jest.fn<Promise<FavoritesSyncResult>, [string]>(() => {
        return Promise.resolve({ status: 'SYNCED' });
      }),
      saveFavorite: jest.fn<Promise<FavoritesSyncResult>, [StationNearbyResponse]>(() => {
        return Promise.resolve({ status: 'ERROR' });
      }),
      toggleFavorite: jest.fn<Promise<FavoritesSyncResult>, [StationNearbyResponse]>(() => {
        return Promise.resolve({ status: 'ERROR' });
      }),
    };

    render(
      <StationsScreen
        favoritesSyncClient={favoritesSyncMock as unknown as FavoritesSync}
        mapboxToken="pk.test.token"
        stationsApiClient={stationsApiClient}
      />,
    );

    await screen.findByTestId('stations-map');

    fireEvent(screen.getByTestId('station-shape-source'), 'press', {
      features: [
        {
          properties: {
            id: STATIONS[0]?.id,
          },
          type: 'Feature',
        },
      ],
    });

    fireEvent.press(await screen.findByTestId('station-bottom-sheet-favorite-button'));

    expect(favoritesSyncMock.toggleFavorite).toHaveBeenCalledWith(STATIONS[0]);

    await waitFor(() => {
      expect(screen.getByTestId('favorites-sync-error')).toBeTruthy();
    });
    expect(
      screen.getByText('Չհաջողվեց թարմացնել սիրված կայանները սերվերում. փոփոխությունը չեղարկվեց:'),
    ).toBeTruthy();
  });

  it('shows loading indicator while stations are being refreshed', async () => {
    const stationsApiClient = createStationsApiClientMock();
    stationsApiClient.getNearbyStations.mockImplementation(() => {
      return new Promise(() => {
        /* never resolves — keeps loading state active */
      });
    });

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    expect(screen.getByTestId('stations-loading-indicator')).toBeTruthy();
  });

  it('shows error message when station refresh fails', async () => {
    const stationsApiClient = createStationsApiClientMock();
    stationsApiClient.getNearbyStations.mockRejectedValue(new Error('Network error'));

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    expect(await screen.findByTestId('stations-load-error')).toBeTruthy();
  });

  it('renders map with no station markers when filters return empty results', async () => {
    const stationsApiClient = createStationsApiClientMock();
    stationsApiClient.getNearbyStations.mockResolvedValue([]);

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

    expect(screen.getByTestId('station-shape-source')).toBeTruthy();
    expect(screen.queryByTestId('station-bottom-sheet')).toBeNull();
  });

  it('shows honest empty state instead of fallback stations when API returns no stations', async () => {
    const stationsApiClient = createStationsApiClientMock();
    stationsApiClient.getNearbyStations.mockResolvedValue([]);

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    expect(await screen.findByTestId('stations-empty-state')).toHaveTextContent(
      'Այս տարածքում լիցքավորման կայաններ չեն գտնվել',
    );
    expect(screen.queryByText('Kentron Hub')).toBeNull();
    expect(screen.queryByText('Tumanyan DC')).toBeNull();
  });

  it('does not show the empty state while loading or when refresh fails', async () => {
    const stationsApiClient = createStationsApiClientMock();
    stationsApiClient.getNearbyStations.mockRejectedValue(new Error('Network error'));

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    expect(await screen.findByTestId('stations-load-error')).toBeTruthy();
    expect(screen.queryByTestId('stations-empty-state')).toBeNull();
  });

  it('hides the empty state when the API returns stations', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('stations-loading-indicator')).toBeNull();
    });

    expect(screen.queryByTestId('stations-empty-state')).toBeNull();
  });

  it('queries nearby stations with device coordinates when location permission is granted', async () => {
    requestForegroundPermissionsAsyncMock.mockResolvedValue(buildLocationPermission(true));
    getCurrentPositionAsyncMock.mockResolvedValue(buildLocationPosition(41.0138, 44.9871));
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          latitude: 41.0138,
          longitude: 44.9871,
        }),
      );
    });
  });

  it('falls back to the Yerevan center when location permission is denied', async () => {
    requestForegroundPermissionsAsyncMock.mockResolvedValue(buildLocationPermission(false));
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          latitude: 40.1792,
          longitude: 44.4991,
        }),
      );
    });
    expect(getCurrentPositionAsyncMock).not.toHaveBeenCalled();
  });

  it('falls back to the Yerevan center when resolving the device position fails', async () => {
    requestForegroundPermissionsAsyncMock.mockResolvedValue(buildLocationPermission(true));
    getCurrentPositionAsyncMock.mockRejectedValue(new Error('GPS unavailable'));
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(getCurrentPositionAsyncMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(stationsApiClient.getNearbyStations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          latitude: 40.1792,
          longitude: 44.4991,
        }),
      );
    });
  });

  it('recenters the map camera on the device position once location resolves', async () => {
    requestForegroundPermissionsAsyncMock.mockResolvedValue(buildLocationPermission(true));
    getCurrentPositionAsyncMock.mockResolvedValue(buildLocationPosition(41.0138, 44.9871));
    const stationsApiClient = createStationsApiClientMock();
    const rendered = render(
      <StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />,
    );

    await screen.findByTestId('stations-map');

    await waitFor(() => {
      expect(rendered.UNSAFE_getByProps({ zoomLevel: 12 })).toHaveProp(
        'centerCoordinate',
        [44.9871, 41.0138],
      );
    });
  });

  it('surfaces an error when the offline map download fails in mock map mode', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationsScreen mapboxToken="pk.test.token" stationsApiClient={stationsApiClient} />);

    await screen.findByTestId('stations-map');

    fireEvent.press(screen.getByText('Ներբեռնել offline քարտեզ'));

    expect(await screen.findByText('Offline քարտեզի ներբեռնումը ձախողվեց')).toBeTruthy();
    expect(screen.queryByText('Offline քարտեզի ներբեռնումն ավարտված է')).toBeNull();
  });
});
