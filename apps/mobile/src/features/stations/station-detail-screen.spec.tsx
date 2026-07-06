import type { MostConfidentStatusResponse, StationDetailResponse } from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiClientError } from '../../api';
import { StationDetailScreen } from './station-detail-screen';

const STATION_ID = '11111111-1111-1111-1111-111111111111';
const CCS_CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';
const TYPE2_CONNECTOR_ID = '33333333-3333-3333-3333-333333333333';

const mockPush = jest.fn<void, [string]>();
const mockReplace = jest.fn<void, [string]>();

let mockParams: { id?: string };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

function buildStationDetail(): StationDetailResponse {
  return {
    address: 'Arami 6',
    amenities: ['parking', 'cafe'],
    averageRating: 4.5,
    city: 'Yerevan',
    connectors: [
      {
        connectorType: ConnectorType.CCS,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVA-001',
        id: CCS_CONNECTOR_ID,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 120,
        stationId: STATION_ID,
        status: StationStatus.AVAILABLE,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
      {
        connectorType: ConnectorType.TYPE_2,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVA-002',
        id: TYPE2_CONNECTOR_ID,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 22,
        stationId: STATION_ID,
        status: StationStatus.OCCUPIED,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
    ],
    createdAt: '2026-02-17T00:00:00.000Z',
    distanceMeters: 320,
    id: STATION_ID,
    latitude: 40.177,
    longitude: 44.511,
    name: 'Arami Fast Charge',
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    pricingPlans: [
      {
        connectorId: CCS_CONNECTOR_ID,
        createdAt: '2026-02-17T00:00:00.000Z',
        id: '44444444-4444-4444-4444-444444444444',
        idleFee: null,
        name: 'Day Tariff',
        pricePerKwh: 145,
        pricePerMinute: null,
        sessionFee: 500,
        updatedAt: '2026-02-17T00:00:00.000Z',
        validFrom: '2026-02-17T00:00:00.000Z',
        validUntil: null,
      },
    ],
    reviewCount: 2,
    reviews: [
      {
        comment: 'Great speed.',
        createdAt: '2026-02-17T00:00:00.000Z',
        id: '55555555-5555-5555-5555-555555555555',
        photos: [],
        rating: 5,
        stationId: STATION_ID,
        updatedAt: '2026-02-17T00:00:00.000Z',
        userId: 'user-1',
      },
      {
        comment: null,
        createdAt: '2026-02-17T00:00:00.000Z',
        id: '66666666-6666-6666-6666-666666666666',
        photos: [],
        rating: 4,
        stationId: STATION_ID,
        updatedAt: '2026-02-17T00:00:00.000Z',
        userId: 'user-2',
      },
    ],
    status: StationStatus.AVAILABLE,
    updatedAt: '2026-02-17T00:00:00.000Z',
  };
}

interface StationsApiClientMock {
  readonly getConnectorCommunityStatus: jest.Mock<
    Promise<MostConfidentStatusResponse | null>,
    [string]
  >;
  readonly getStationDetail: jest.Mock<Promise<StationDetailResponse>, [string]>;
}

function createStationsApiClientMock(): StationsApiClientMock {
  return {
    getConnectorCommunityStatus: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(
      () => {
        return Promise.resolve(null);
      },
    ),
    getStationDetail: jest.fn<Promise<StationDetailResponse>, [string]>(() => {
      return Promise.resolve(buildStationDetail());
    }),
  };
}

describe('StationDetailScreen', () => {
  beforeEach(() => {
    mockParams = { id: STATION_ID };
  });

  it('shows a loading state while the station detail request is pending', () => {
    const stationsApiClient = createStationsApiClientMock();

    stationsApiClient.getStationDetail.mockImplementation(() => {
      return new Promise<StationDetailResponse>(() => {
        // Intentionally never resolves to keep the loading state visible.
      });
    });

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    expect(screen.getByTestId('station-detail-loading')).toBeTruthy();
  });

  it('renders station facts, amenities, connectors, pricing plans, and reviews', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('station-detail-screen')).toBeTruthy();
    });

    expect(stationsApiClient.getStationDetail).toHaveBeenCalledWith(STATION_ID);
    expect(screen.getByText('Arami Fast Charge')).toBeTruthy();
    expect(screen.getByText(/LiloCharge/)).toBeTruthy();
    expect(screen.getByTestId('station-detail-address')).toHaveTextContent('Arami 6, Yerevan');
    expect(screen.getByText(/24\/7/)).toBeTruthy();
    expect(screen.getByTestId('station-detail-amenities')).toHaveTextContent('parking · cafe');
    expect(screen.getByTestId(`station-detail-connector-${CCS_CONNECTOR_ID}`)).toBeTruthy();
    expect(screen.getByTestId(`station-detail-connector-${TYPE2_CONNECTOR_ID}`)).toBeTruthy();
    expect(screen.getByText('CCS · 120 kW')).toBeTruthy();
    expect(screen.getByText('Type 2 · 22 kW')).toBeTruthy();
    expect(
      screen.getByTestId('station-detail-pricing-plan-44444444-4444-4444-4444-444444444444'),
    ).toBeTruthy();
    expect(screen.getByText('Day Tariff')).toBeTruthy();
    expect(screen.getAllByText(/145 ֏\/kWh/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('station-detail-review-summary')).toHaveTextContent('4.5/5');
    expect(
      screen.getByTestId('station-detail-review-55555555-5555-5555-5555-555555555555'),
    ).toBeTruthy();
    expect(screen.getByText('Great speed.')).toBeTruthy();
    expect(screen.getByText('Մեկնաբանություն չկա')).toBeTruthy();
  });

  it('routes to the charge confirmation flow when pressing "Charge here"', async () => {
    const stationsApiClient = createStationsApiClientMock();

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId(`station-detail-charge-${CCS_CONNECTOR_ID}`)).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId(`station-detail-charge-${CCS_CONNECTOR_ID}`));

    expect(mockPush).toHaveBeenCalledWith(
      `/charge/confirm?connectorId=${CCS_CONNECTOR_ID}&stationId=${STATION_ID}`,
    );
  });

  it('shows community-reported confidence hints per connector when available', async () => {
    const stationsApiClient = createStationsApiClientMock();
    const reportedAt = new Date(Date.now() - 7 * 60_000).toISOString();

    stationsApiClient.getConnectorCommunityStatus.mockImplementation(
      (connectorId: string): Promise<MostConfidentStatusResponse | null> => {
        if (connectorId !== CCS_CONNECTOR_ID) {
          return Promise.reject(new Error('lookup failed'));
        }

        return Promise.resolve({
          confidenceScore: 0.91,
          connectorId,
          latestUpdate: {
            comment: null,
            confidenceScore: 0.95,
            connectorId,
            createdAt: reportedAt,
            id: '77777777-7777-7777-7777-777777777777',
            status: StationStatus.AVAILABLE,
            updatedAt: reportedAt,
            userId: 'user-9',
          },
          status: StationStatus.AVAILABLE,
        });
      },
    );

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    await waitFor(() => {
      expect(
        screen.getByTestId(`station-detail-community-status-${CCS_CONNECTOR_ID}`),
      ).toBeTruthy();
    });

    const hintText = screen.getByTestId(`station-detail-community-status-${CCS_CONNECTOR_ID}`);

    expect(hintText).toHaveTextContent(/91%/);
    expect(hintText).toHaveTextContent(/7 րոպե առաջ/);
    expect(stationsApiClient.getConnectorCommunityStatus).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByTestId(`station-detail-community-status-${TYPE2_CONNECTOR_ID}`),
    ).toBeNull();
  });

  it('shows an error state with retry when the detail request fails', async () => {
    const stationsApiClient = createStationsApiClientMock();

    stationsApiClient.getStationDetail.mockRejectedValueOnce(new Error('network down'));

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('station-detail-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('station-detail-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('station-detail-screen')).toBeTruthy();
    });

    expect(stationsApiClient.getStationDetail).toHaveBeenCalledTimes(2);
  });

  it('shows a not-found state for HTTP 404 responses', async () => {
    const stationsApiClient = createStationsApiClientMock();

    stationsApiClient.getStationDetail.mockRejectedValue(
      new ApiClientError('Station not found', {
        code: 'HTTP_ERROR',
        path: `/stations/${STATION_ID}`,
        statusCode: 404,
      }),
    );

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    await waitFor(() => {
      expect(screen.getByTestId('station-detail-not-found')).toBeTruthy();
    });
  });

  it('shows a not-found state when the route param is missing', () => {
    mockParams = {};

    const stationsApiClient = createStationsApiClientMock();

    render(<StationDetailScreen stationsApiClient={stationsApiClient} />);

    expect(screen.getByTestId('station-detail-not-found')).toBeTruthy();
    expect(stationsApiClient.getStationDetail).not.toHaveBeenCalled();
  });
});
