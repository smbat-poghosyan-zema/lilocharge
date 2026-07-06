import { ProblemReportStatus, ProblemType } from '@lilocharge/shared-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ProblemReportScreen } from './problem-report-screen';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';

const mockBack = jest.fn<void, []>();
const mockReplace = jest.fn<void, [string]>();

let mockParams: { id?: string };
let mockedSessionState: { userId: string | null };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
}));

jest.mock('../onboarding/onboarding-session', () => ({
  useOnboardingSession: () => ({
    state: mockedSessionState,
  }),
}));

interface ProblemReportsApiClientMock {
  readonly createProblemReport: jest.Mock;
}

function createProblemReportsApiClientMock(): ProblemReportsApiClientMock {
  return {
    createProblemReport: jest.fn(() =>
      Promise.resolve({
        createdAt: '2026-07-06T10:00:00.000Z',
        description: 'No power on the left charger.',
        id: '33333333-3333-3333-3333-333333333333',
        photos: [],
        problemType: ProblemType.NO_POWER,
        resolvedAt: null,
        stationId: STATION_ID,
        status: ProblemReportStatus.PENDING,
        userId: USER_ID,
      }),
    ),
  };
}

describe('ProblemReportScreen', () => {
  beforeEach(() => {
    mockParams = { id: STATION_ID };
    mockedSessionState = { userId: USER_ID };
  });

  it('renders one picker option per shared problem type', () => {
    render(<ProblemReportScreen problemReportsApiClient={createProblemReportsApiClientMock()} />);

    for (const problemType of Object.values(ProblemType)) {
      expect(screen.getByTestId(`problem-report-type-${problemType}`)).toBeTruthy();
    }
  });

  it('submits the selected type with a trimmed description and shows success', async () => {
    const problemReportsApiClient = createProblemReportsApiClientMock();

    render(<ProblemReportScreen problemReportsApiClient={problemReportsApiClient} />);

    fireEvent.press(screen.getByTestId('problem-report-type-NO_POWER'));
    fireEvent.changeText(
      screen.getByTestId('problem-report-description-input'),
      '  No power on the left charger.  ',
    );
    fireEvent.press(screen.getByTestId('problem-report-submit'));

    await waitFor(() => {
      expect(problemReportsApiClient.createProblemReport).toHaveBeenCalledWith(USER_ID, {
        description: 'No power on the left charger.',
        problemType: ProblemType.NO_POWER,
        stationId: STATION_ID,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('problem-report-success')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('problem-report-done'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('requires a description before submitting', () => {
    const problemReportsApiClient = createProblemReportsApiClientMock();

    render(<ProblemReportScreen problemReportsApiClient={problemReportsApiClient} />);

    fireEvent.press(screen.getByTestId('problem-report-submit'));

    expect(screen.getByTestId('problem-report-error')).toBeTruthy();
    expect(problemReportsApiClient.createProblemReport).not.toHaveBeenCalled();
  });

  it('shows an error when submission fails', async () => {
    const problemReportsApiClient = createProblemReportsApiClientMock();

    problemReportsApiClient.createProblemReport.mockRejectedValue(new Error('network down'));

    render(<ProblemReportScreen problemReportsApiClient={problemReportsApiClient} />);

    fireEvent.changeText(screen.getByTestId('problem-report-description-input'), 'Broken plug');
    fireEvent.press(screen.getByTestId('problem-report-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('problem-report-error')).toBeTruthy();
    });

    expect(screen.getByTestId('problem-report-screen')).toBeTruthy();
  });

  it('shows a missing-station message when the route param is absent', () => {
    mockParams = {};

    render(<ProblemReportScreen problemReportsApiClient={createProblemReportsApiClientMock()} />);

    expect(screen.getByTestId('problem-report-missing-station')).toBeTruthy();
  });

  it('shows a sign-in prompt when signed out', () => {
    mockedSessionState = { userId: null };

    const problemReportsApiClient = createProblemReportsApiClientMock();

    render(<ProblemReportScreen problemReportsApiClient={problemReportsApiClient} />);

    expect(screen.getByTestId('problem-report-signed-out')).toBeTruthy();

    fireEvent.press(screen.getByTestId('problem-report-sign-in'));

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/login');
  });
});
