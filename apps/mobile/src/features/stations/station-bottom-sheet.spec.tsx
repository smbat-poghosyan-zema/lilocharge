import type {
  MostConfidentStatusResponse,
  StationDetailResponse,
  StationNearbyResponse,
} from '@lilocharge/shared-types';
import { ConnectorType, StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { StationBottomSheet } from './station-bottom-sheet';

/**
 * Builds a community status client stub that reports no community data.
 */
function createCommunityStatusClientMock(): {
  readonly getConnectorCommunityStatus: jest.Mock<
    Promise<MostConfidentStatusResponse | null>,
    [string]
  >;
} {
  return {
    getConnectorCommunityStatus: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(
      () => {
        return Promise.resolve(null);
      },
    ),
  };
}

/**
 * Builds a community-reported status fixture for one connector.
 */
function buildCommunityStatus(
  connectorId: string,
  reportedAgoMs: number,
): MostConfidentStatusResponse {
  const reportedAt = new Date(Date.now() - reportedAgoMs).toISOString();

  return {
    confidenceScore: 0.87,
    connectorId,
    latestUpdate: {
      comment: null,
      confidenceScore: 0.95,
      connectorId,
      createdAt: reportedAt,
      id: '77777777-7777-7777-7777-777777777777',
      status: StationStatus.OCCUPIED,
      updatedAt: reportedAt,
      userId: 'user-9',
    },
    status: StationStatus.OCCUPIED,
  };
}

const STATION: StationNearbyResponse = {
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
};

const STATION_DETAIL: StationDetailResponse = {
  address: 'Arami 6',
  amenities: ['parking'],
  averageRating: 4.7,
  city: 'Yerevan',
  connectors: [
    {
      connectorType: ConnectorType.CCS,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-001',
      id: '22222222-2222-2222-2222-222222222222',
      lastStatusUpdate: '2026-02-17T00:00:00.000Z',
      powerKw: 120,
      stationId: STATION.id,
      status: StationStatus.AVAILABLE,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
    {
      connectorType: ConnectorType.TYPE_2,
      createdAt: '2026-02-17T00:00:00.000Z',
      evseId: 'EVA-002',
      id: '33333333-3333-3333-3333-333333333333',
      lastStatusUpdate: '2026-02-17T00:00:00.000Z',
      powerKw: 22,
      stationId: STATION.id,
      status: StationStatus.OCCUPIED,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
  ],
  createdAt: '2026-02-17T00:00:00.000Z',
  distanceMeters: 280,
  id: STATION.id,
  latitude: STATION.latitude,
  longitude: STATION.longitude,
  name: STATION.name,
  openingHours: STATION.openingHours,
  operatorId: STATION.operatorId,
  operatorName: STATION.operatorName,
  pricingPlans: [
    {
      connectorId: '22222222-2222-2222-2222-222222222222',
      createdAt: '2026-02-17T00:00:00.000Z',
      id: '44444444-4444-4444-4444-444444444444',
      idleFee: 25,
      name: 'Day Tariff',
      pricePerKwh: 145,
      pricePerMinute: 12,
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
      stationId: STATION.id,
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: 'user-1',
    },
    {
      comment: 'Parking is tight.',
      createdAt: '2026-02-17T00:00:00.000Z',
      id: '66666666-6666-6666-6666-666666666666',
      photos: [],
      rating: 4,
      stationId: STATION.id,
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: 'user-2',
    },
  ],
  status: StationStatus.AVAILABLE,
  updatedAt: '2026-02-17T00:00:00.000Z',
};

describe('StationBottomSheet', () => {
  it('renders station details, connector cards, pricing, and reviews', () => {
    render(
      <StationBottomSheet
        communityStatusClient={createCommunityStatusClientMock()}
        hasActiveConnectorFilters={false}
        hasDetailLoadError={false}
        isFavorite={false}
        isLoadingDetail={false}
        station={STATION}
        stationDetail={STATION_DETAIL}
        onClose={jest.fn()}
        onNavigateToDetail={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );

    expect(screen.getByTestId('station-bottom-sheet')).toBeTruthy();
    expect(screen.getByText('Arami Fast Charge')).toBeTruthy();
    expect(screen.getByText('Day Tariff')).toBeTruthy();
    expect(
      screen.getByTestId('station-connector-card-22222222-2222-2222-2222-222222222222'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('station-connector-card-33333333-3333-3333-3333-333333333333'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('station-review-card-55555555-5555-5555-5555-555555555555'),
    ).toBeTruthy();
    expect(screen.getByText('Great speed.')).toBeTruthy();
  });

  it('supports close and navigate-to-detail actions', () => {
    const onClose = jest.fn<void, []>();
    const onNavigateToDetail = jest.fn<void, [string]>();
    const onToggleFavorite = jest.fn<void, [StationNearbyResponse]>();

    render(
      <StationBottomSheet
        communityStatusClient={createCommunityStatusClientMock()}
        hasActiveConnectorFilters={false}
        hasDetailLoadError={false}
        isFavorite={false}
        isLoadingDetail={false}
        station={STATION}
        stationDetail={STATION_DETAIL}
        onClose={onClose}
        onNavigateToDetail={onNavigateToDetail}
        onToggleFavorite={onToggleFavorite}
      />,
    );

    fireEvent.press(screen.getByTestId('station-bottom-sheet-close-button'));
    fireEvent.press(screen.getByTestId('station-bottom-sheet-favorite-button'));
    fireEvent.press(screen.getByTestId('station-bottom-sheet-detail-button'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToggleFavorite).toHaveBeenCalledWith(STATION);
    expect(onNavigateToDetail).toHaveBeenCalledWith(STATION.id);
  });

  it('renders loading and error states for station detail fetch', () => {
    const rendered = render(
      <StationBottomSheet
        hasActiveConnectorFilters={false}
        hasDetailLoadError={false}
        isFavorite={false}
        isLoadingDetail
        station={STATION}
        stationDetail={null}
        onClose={jest.fn()}
        onNavigateToDetail={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );

    expect(screen.getByTestId('station-bottom-sheet-detail-loading')).toBeTruthy();

    rendered.rerender(
      <StationBottomSheet
        hasActiveConnectorFilters={false}
        hasDetailLoadError
        isFavorite={false}
        isLoadingDetail={false}
        station={STATION}
        stationDetail={null}
        onClose={jest.fn()}
        onNavigateToDetail={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );

    expect(
      within(screen.getByTestId('station-bottom-sheet')).getByTestId(
        'station-bottom-sheet-detail-error',
      ),
    ).toBeTruthy();
  });

  it('renders empty state when station detail has no connectors and no reviews', () => {
    const emptyDetail: StationDetailResponse = {
      ...STATION_DETAIL,
      connectors: [],
      pricingPlans: [],
      reviewCount: 0,
      reviews: [],
    };

    render(
      <StationBottomSheet
        hasActiveConnectorFilters={false}
        hasDetailLoadError={false}
        isFavorite={false}
        isLoadingDetail={false}
        station={STATION}
        stationDetail={emptyDetail}
        onClose={jest.fn()}
        onNavigateToDetail={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );

    expect(screen.getByTestId('station-bottom-sheet')).toBeTruthy();
    expect(screen.getByText('Միակցիչներ առկա չեն')).toBeTruthy();
    expect(screen.getAllByText(/Կարծիքներ դեռ չկան/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a community-reported confidence hint for connectors that have one', async () => {
    const reportedConnectorId = '22222222-2222-2222-2222-222222222222';
    const communityStatus = buildCommunityStatus(reportedConnectorId, 5 * 60_000);
    const communityStatusClient = {
      getConnectorCommunityStatus: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(
        (connectorId: string) => {
          return Promise.resolve(connectorId === reportedConnectorId ? communityStatus : null);
        },
      ),
    };

    render(
      <StationBottomSheet
        communityStatusClient={communityStatusClient}
        hasActiveConnectorFilters={false}
        hasDetailLoadError={false}
        isFavorite={false}
        isLoadingDetail={false}
        station={STATION}
        stationDetail={STATION_DETAIL}
        onClose={jest.fn()}
        onNavigateToDetail={jest.fn()}
        onToggleFavorite={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId(`station-connector-community-status-${reportedConnectorId}`),
      ).toBeTruthy();
    });

    const hintText = screen.getByTestId(
      `station-connector-community-status-${reportedConnectorId}`,
    );

    expect(hintText).toHaveTextContent(/Զբաղված/);
    expect(hintText).toHaveTextContent(/87%/);
    expect(hintText).toHaveTextContent(/5 րոպե առաջ/);
    expect(communityStatusClient.getConnectorCommunityStatus).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByTestId('station-connector-community-status-33333333-3333-3333-3333-333333333333'),
    ).toBeNull();
  });
});
