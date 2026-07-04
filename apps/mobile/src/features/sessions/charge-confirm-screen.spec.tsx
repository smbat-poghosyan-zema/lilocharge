import type { SessionResponse, StationDetailResponse } from '@lilocharge/shared-types';
import { ConnectorType, SessionStatus, StationStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiClientError } from '../../api';
import { ChargeConfirmScreen } from './charge-confirm-screen';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '44444444-4444-4444-4444-444444444444';
const CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

const mockPush = jest.fn<void, [string]>();
const mockReplace = jest.fn<void, [string]>();

let mockParams: { connectorId?: string; stationId?: string };
let mockedSessionState: { userId: string | null };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('../onboarding/onboarding-session', () => ({
  useOnboardingSession: () => ({
    state: mockedSessionState,
  }),
}));

function buildSessionResponse(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    connectorId: CONNECTOR_ID,
    createdAt: '2026-07-01T10:00:00.000Z',
    endTime: null,
    energyDelivered: 0,
    id: SESSION_ID,
    peakPower: 0,
    startTime: null,
    status: SessionStatus.PENDING,
    totalCost: 0,
    transactionId: null,
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    vehicleId: null,
    ...overrides,
  };
}

function buildStationDetail(): StationDetailResponse {
  return {
    address: 'Arami 6',
    amenities: [],
    averageRating: null,
    city: 'Yerevan',
    connectors: [
      {
        connectorType: ConnectorType.CCS,
        createdAt: '2026-02-17T00:00:00.000Z',
        evseId: 'EVA-001',
        id: CONNECTOR_ID,
        lastStatusUpdate: '2026-02-17T00:00:00.000Z',
        powerKw: 120,
        stationId: STATION_ID,
        status: StationStatus.AVAILABLE,
        updatedAt: '2026-02-17T00:00:00.000Z',
      },
    ],
    createdAt: '2026-02-17T00:00:00.000Z',
    distanceMeters: null,
    id: STATION_ID,
    latitude: 40.177,
    longitude: 44.511,
    name: 'Arami Fast Charge',
    openingHours: '24/7',
    operatorId: 'operator-1',
    operatorName: 'LiloCharge',
    pricingPlans: [
      {
        connectorId: CONNECTOR_ID,
        createdAt: '2026-02-17T00:00:00.000Z',
        id: 'pricing-1',
        idleFee: null,
        name: 'Standard',
        pricePerKwh: 250,
        pricePerMinute: null,
        sessionFee: null,
        updatedAt: '2026-02-17T00:00:00.000Z',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
      },
    ],
    reviewCount: 0,
    reviews: [],
    status: StationStatus.AVAILABLE,
    updatedAt: '2026-02-17T00:00:00.000Z',
  };
}

describe('ChargeConfirmScreen', () => {
  beforeEach(() => {
    mockParams = { connectorId: CONNECTOR_ID };
    mockedSessionState = { userId: USER_ID };
  });

  it('shows a missing-connector state with a rescan action', () => {
    mockParams = {};

    render(<ChargeConfirmScreen />);

    expect(screen.getByTestId('confirm-missing-connector')).toBeTruthy();

    fireEvent.press(screen.getByTestId('confirm-rescan'));

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/charge');
  });

  it('shows an unauthenticated state with a sign-in action', () => {
    mockedSessionState = { userId: null };

    render(<ChargeConfirmScreen />);

    expect(screen.getByTestId('confirm-unauthenticated')).toBeTruthy();

    fireEvent.press(screen.getByTestId('confirm-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/login');
  });

  it('renders a generic connector message when no station id is known', () => {
    render(<ChargeConfirmScreen />);

    expect(screen.getByTestId('confirm-connector-generic')).toBeTruthy();
    expect(screen.getByText(new RegExp(CONNECTOR_ID))).toBeTruthy();
  });

  it('fetches and renders the matching connector details for a known station', async () => {
    const getStationDetail = jest.fn(() => Promise.resolve(buildStationDetail()));

    mockParams = { connectorId: CONNECTOR_ID, stationId: STATION_ID };

    render(<ChargeConfirmScreen stationsApiClient={{ getStationDetail }} />);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-station-detail')).toBeTruthy();
    });

    expect(getStationDetail).toHaveBeenCalledWith(STATION_ID);
    expect(screen.getByText('Arami Fast Charge')).toBeTruthy();
    expect(screen.getByText('CCS · 120 kW')).toBeTruthy();
    expect(screen.getByText(/250 ֏\/kWh/)).toBeTruthy();
  });

  it('falls back to the generic connector display when the station fetch fails', async () => {
    const getStationDetail = jest.fn(() => Promise.reject(new Error('offline')));

    mockParams = { connectorId: CONNECTOR_ID, stationId: STATION_ID };

    render(<ChargeConfirmScreen stationsApiClient={{ getStationDetail }} />);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-station-error')).toBeTruthy();
    });

    expect(screen.getByTestId('confirm-connector-generic')).toBeTruthy();
  });

  it('creates and starts a session, then opens the active session screen', async () => {
    const createSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const startSession = jest.fn(() =>
      Promise.resolve(
        buildSessionResponse({
          startTime: '2026-07-01T10:01:00.000Z',
          status: SessionStatus.ACTIVE,
        }),
      ),
    );

    render(<ChargeConfirmScreen sessionsApiClient={{ createSession, startSession }} />);

    fireEvent.press(screen.getByTestId('confirm-start'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(`/sessions/${SESSION_ID}`);
    });

    expect(createSession).toHaveBeenCalledWith(USER_ID, { connectorId: CONNECTOR_ID });
    expect(startSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
  });

  it('shows a connector-unavailable error for HTTP 409 and supports retry', async () => {
    const conflictError = new ApiClientError('Connector busy', {
      code: 'HTTP_ERROR',
      path: '/users/x/sessions',
      statusCode: 409,
    });
    const createSession = jest
      .fn<Promise<SessionResponse>, [string, { connectorId?: string }]>()
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce(buildSessionResponse());
    const startSession = jest.fn(() =>
      Promise.resolve(buildSessionResponse({ status: SessionStatus.ACTIVE })),
    );

    render(<ChargeConfirmScreen sessionsApiClient={{ createSession, startSession }} />);

    fireEvent.press(screen.getByTestId('confirm-start'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-error')).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('confirm-retry'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(`/sessions/${SESSION_ID}`);
    });

    expect(createSession).toHaveBeenCalledTimes(2);
  });

  it('does not re-create the session when only the start call failed', async () => {
    const createSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const startSession = jest
      .fn<Promise<SessionResponse>, [string, string]>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(buildSessionResponse({ status: SessionStatus.ACTIVE }));

    render(<ChargeConfirmScreen sessionsApiClient={{ createSession, startSession }} />);

    fireEvent.press(screen.getByTestId('confirm-start'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('confirm-retry'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(`/sessions/${SESSION_ID}`);
    });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledTimes(2);
  });
});
