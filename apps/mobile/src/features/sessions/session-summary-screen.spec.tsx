import type { SessionResponse } from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { SessionSummaryScreen } from './session-summary-screen';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

const mockReplace = jest.fn<void, [string]>();

let mockParams: { id?: string };
let mockedSessionState: { userId: string | null };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('../onboarding/onboarding-session', () => ({
  useOnboardingSession: () => ({
    state: mockedSessionState,
  }),
}));

function buildCompletedSession(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    connectorId: '22222222-2222-2222-2222-222222222222',
    createdAt: '2026-07-01T10:00:00.000Z',
    endTime: '2026-07-01T11:15:30.000Z',
    energyDelivered: 21.4,
    id: SESSION_ID,
    peakPower: 50,
    startTime: '2026-07-01T10:00:00.000Z',
    status: SessionStatus.COMPLETED,
    totalCost: 535000,
    transactionId: 'txn-1',
    updatedAt: '2026-07-01T11:15:30.000Z',
    userId: USER_ID,
    vehicleId: null,
    ...overrides,
  };
}

describe('SessionSummaryScreen', () => {
  beforeEach(() => {
    mockParams = { id: SESSION_ID };
    mockedSessionState = { userId: USER_ID };
  });

  it('renders the final breakdown for a completed session', async () => {
    const getSession = jest.fn(() => Promise.resolve(buildCompletedSession()));

    render(<SessionSummaryScreen sessionsApiClient={{ getSession }} />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-status')).toBeTruthy();
    });

    expect(getSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
    expect(screen.getByTestId('summary-energy')).toHaveTextContent('21.40 kWh');
    expect(screen.getByTestId('summary-duration')).toHaveTextContent('1:15:30');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('5350 ֏');
  });

  it('opens the receipt URL through the system linking API', async () => {
    const openUrlSpy = jest
      .spyOn(Linking, 'openURL')
      .mockImplementation(() => Promise.resolve(true));
    const getSession = jest.fn(() => Promise.resolve(buildCompletedSession()));

    render(<SessionSummaryScreen sessionsApiClient={{ getSession }} />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-receipt')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('summary-receipt'));

    expect(openUrlSpy).toHaveBeenCalledWith(
      `http://localhost:3000/users/${USER_ID}/sessions/${SESSION_ID}/receipt`,
    );
  });

  it('navigates back to the stations tab from the done action', async () => {
    const getSession = jest.fn(() => Promise.resolve(buildCompletedSession()));

    render(<SessionSummaryScreen sessionsApiClient={{ getSession }} />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-done')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('summary-done'));

    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stations');
  });

  it('shows a load error with a retry action when fetching fails', async () => {
    const getSession = jest
      .fn<Promise<SessionResponse>, [string, string]>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(buildCompletedSession());

    render(<SessionSummaryScreen sessionsApiClient={{ getSession }} />);

    await waitFor(() => {
      expect(screen.getByTestId('summary-load-error')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('summary-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('summary-status')).toBeTruthy();
    });

    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('renders an error state when the session id is missing', () => {
    mockParams = {};

    render(<SessionSummaryScreen sessionsApiClient={{ getSession: jest.fn() }} />);

    expect(screen.getByTestId('summary-load-error')).toBeTruthy();
    expect(screen.queryByTestId('summary-retry')).toBeNull();
  });
});
