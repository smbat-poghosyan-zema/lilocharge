import type { SessionMonitorUpdateEvent, SessionResponse } from '@lilocharge/shared-types';
import { SESSION_MONITOR_UPDATE_EVENT, SessionStatus } from '@lilocharge/shared-types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { ActiveSessionScreen } from './active-session-screen';
import type { SessionMonitoringClient } from './session-monitoring-client';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';
const CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';

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

function buildSessionResponse(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    connectorId: CONNECTOR_ID,
    createdAt: '2026-07-01T10:00:00.000Z',
    endTime: null,
    energyDelivered: 8.5,
    id: SESSION_ID,
    peakPower: 48,
    startTime: '2026-07-01T10:00:00.000Z',
    status: SessionStatus.ACTIVE,
    totalCost: 212550,
    transactionId: null,
    updatedAt: '2026-07-01T10:00:00.000Z',
    userId: USER_ID,
    vehicleId: null,
    ...overrides,
  };
}

interface FakeMonitoring {
  readonly client: SessionMonitoringClient;
  readonly disconnect: jest.Mock;
  readonly emitUpdate: (payload: SessionMonitorUpdateEvent) => void;
  readonly unsubscribe: jest.Mock;
}

/**
 * Builds one fake monitoring client that captures subscription handlers.
 */
function createFakeMonitoringClient(): FakeMonitoring {
  const handlers: Array<(payload: SessionMonitorUpdateEvent) => void> = [];
  const unsubscribe = jest.fn();
  const disconnect = jest.fn();

  return {
    client: {
      connect: jest.fn(),
      disconnect,
      subscribeToSession: (
        _sessionId: string,
        onUpdate: (payload: SessionMonitorUpdateEvent) => void,
      ): (() => void) => {
        handlers.push(onUpdate);

        return unsubscribe;
      },
    },
    disconnect,
    emitUpdate: (payload: SessionMonitorUpdateEvent): void => {
      for (const handler of handlers) {
        handler(payload);
      }
    },
    unsubscribe,
  };
}

describe('ActiveSessionScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T10:30:00.000Z'));
    mockParams = { id: SESSION_ID };
    mockedSessionState = { userId: USER_ID };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads the session and renders live metrics', async () => {
    const getSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const stopSession = jest.fn();
    const monitoring = createFakeMonitoringClient();

    render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        sessionsApiClient={{ getSession, stopSession }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-status')).toBeTruthy();
    });

    expect(getSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
    expect(screen.getByTestId('active-energy')).toHaveTextContent('8.50 kWh');
    expect(screen.getByTestId('active-power')).toHaveTextContent('48.0 kW');
    expect(screen.getByTestId('active-duration')).toHaveTextContent('30:00');
    expect(screen.getByTestId('active-cost')).toHaveTextContent('2125.50 ֏');
  });

  it('applies websocket monitor updates to the displayed metrics', async () => {
    const getSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const stopSession = jest.fn();
    const monitoring = createFakeMonitoringClient();

    render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        sessionsApiClient={{ getSession, stopSession }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-energy')).toBeTruthy();
    });

    act(() => {
      monitoring.emitUpdate({
        connectorId: CONNECTOR_ID,
        energyDeliveredKwh: 12.25,
        event: SESSION_MONITOR_UPDATE_EVENT,
        powerKw: 50,
        sessionId: SESSION_ID,
        timestamp: '2026-07-01T10:31:00.000Z',
        totalCost: 306300,
        transactionId: null,
      });
    });

    expect(screen.getByTestId('active-energy')).toHaveTextContent('12.25 kWh');
    expect(screen.getByTestId('active-power')).toHaveTextContent('50.0 kW');
    expect(screen.getByTestId('active-cost')).toHaveTextContent('3063 ֏');
  });

  it('polls the session and navigates to summary when the session completes', async () => {
    const getSession = jest
      .fn<Promise<SessionResponse>, [string, string]>()
      .mockResolvedValueOnce(buildSessionResponse())
      .mockResolvedValue(
        buildSessionResponse({
          endTime: '2026-07-01T10:45:00.000Z',
          status: SessionStatus.COMPLETED,
        }),
      );
    const stopSession = jest.fn();
    const monitoring = createFakeMonitoringClient();

    render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        pollIntervalMs={15000}
        sessionsApiClient={{ getSession, stopSession }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-status')).toBeTruthy();
    });

    act(() => {
      jest.advanceTimersByTime(15000);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(`/sessions/${SESSION_ID}/summary`);
    });

    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('stops the session after confirmation and navigates to summary', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const getSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const stopSession = jest.fn(() =>
      Promise.resolve(buildSessionResponse({ status: SessionStatus.COMPLETED })),
    );
    const monitoring = createFakeMonitoringClient();

    render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        sessionsApiClient={{ getSession, stopSession }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-stop')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('active-stop'));

    expect(alertSpy).toHaveBeenCalledTimes(1);

    const alertButtons = alertSpy.mock.calls[0][2] as AlertButton[];
    const confirmButton = alertButtons.find((button) => button.style === 'destructive');

    act(() => {
      confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(`/sessions/${SESSION_ID}/summary`);
    });

    expect(stopSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
  });

  it('shows a stop error when stopping fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const getSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const stopSession = jest.fn(() => Promise.reject(new Error('charger offline')));
    const monitoring = createFakeMonitoringClient();

    render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        sessionsApiClient={{ getSession, stopSession }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-stop')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('active-stop'));

    const alertButtons = alertSpy.mock.calls[0][2] as AlertButton[];
    const confirmButton = alertButtons.find((button) => button.style === 'destructive');

    act(() => {
      confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-stop-error')).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('unsubscribes and disconnects monitoring on unmount', async () => {
    const getSession = jest.fn(() => Promise.resolve(buildSessionResponse()));
    const stopSession = jest.fn();
    const monitoring = createFakeMonitoringClient();

    const view = render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        sessionsApiClient={{ getSession, stopSession }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-status')).toBeTruthy();
    });

    view.unmount();

    expect(monitoring.unsubscribe).toHaveBeenCalledTimes(1);
    expect(monitoring.disconnect).toHaveBeenCalledTimes(1);
  });

  it('renders an error state when the user is not authenticated', () => {
    mockedSessionState = { userId: null };

    const monitoring = createFakeMonitoringClient();

    render(
      <ActiveSessionScreen
        monitoringClient={monitoring.client}
        sessionsApiClient={{ getSession: jest.fn(), stopSession: jest.fn() }}
      />,
    );

    expect(screen.getByTestId('active-load-error')).toBeTruthy();
  });
});
