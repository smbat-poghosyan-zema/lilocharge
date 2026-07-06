import { ProblemReportStatus, ProblemType } from '@lilocharge/shared-types';

import { createProblemReportsApi } from './problem-reports-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const STATION_ID = '22222222-2222-2222-2222-222222222222';

describe('problem reports api', () => {
  it('creates a problem report through the typed API client', async () => {
    const apiClientMock = {
      post: jest.fn(() =>
        Promise.resolve({
          createdAt: '2026-07-06T10:00:00.000Z',
          description: 'The CCS plug is cracked.',
          id: '33333333-3333-3333-3333-333333333333',
          photos: [],
          problemType: ProblemType.BROKEN_CONNECTOR,
          resolvedAt: null,
          stationId: STATION_ID,
          status: ProblemReportStatus.PENDING,
          userId: USER_ID,
        }),
      ),
    };

    const problemReportsApi = createProblemReportsApi(apiClientMock as never);

    await expect(
      problemReportsApi.createProblemReport(USER_ID, {
        description: 'The CCS plug is cracked.',
        problemType: ProblemType.BROKEN_CONNECTOR,
        stationId: STATION_ID,
      }),
    ).resolves.toMatchObject({
      problemType: ProblemType.BROKEN_CONNECTOR,
      status: ProblemReportStatus.PENDING,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${USER_ID}/problem-reports`, {
      body: {
        description: 'The CCS plug is cracked.',
        problemType: ProblemType.BROKEN_CONNECTOR,
        stationId: STATION_ID,
      },
    });
  });
});
