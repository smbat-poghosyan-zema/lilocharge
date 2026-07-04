import type { SessionResponse } from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';

import { buildReceiptUrl, createSessionsApi } from './sessions-api';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';
const CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';

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

describe('sessions api', () => {
  it('creates a pending session through the typed API client', async () => {
    const apiClientMock = {
      post: jest.fn(() => Promise.resolve(buildSessionResponse())),
    };

    const sessionsApi = createSessionsApi(apiClientMock as never);

    await expect(
      sessionsApi.createSession(USER_ID, { connectorId: CONNECTOR_ID }),
    ).resolves.toMatchObject({
      id: SESSION_ID,
      status: SessionStatus.PENDING,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(`/users/${USER_ID}/sessions`, {
      body: { connectorId: CONNECTOR_ID },
    });
  });

  it('starts a session with an empty payload by default', async () => {
    const apiClientMock = {
      post: jest.fn(() =>
        Promise.resolve(
          buildSessionResponse({
            startTime: '2026-07-01T10:01:00.000Z',
            status: SessionStatus.ACTIVE,
          }),
        ),
      ),
    };

    const sessionsApi = createSessionsApi(apiClientMock as never);

    await expect(sessionsApi.startSession(USER_ID, SESSION_ID)).resolves.toMatchObject({
      status: SessionStatus.ACTIVE,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(
      `/users/${USER_ID}/sessions/${SESSION_ID}/start`,
      {
        body: {},
      },
    );
  });

  it('stops a session with an explicit endedAt payload', async () => {
    const apiClientMock = {
      post: jest.fn(() =>
        Promise.resolve(
          buildSessionResponse({
            endTime: '2026-07-01T11:00:00.000Z',
            status: SessionStatus.COMPLETED,
          }),
        ),
      ),
    };

    const sessionsApi = createSessionsApi(apiClientMock as never);

    await expect(
      sessionsApi.stopSession(USER_ID, SESSION_ID, { endedAt: '2026-07-01T11:00:00.000Z' }),
    ).resolves.toMatchObject({
      status: SessionStatus.COMPLETED,
    });

    expect(apiClientMock.post).toHaveBeenCalledWith(
      `/users/${USER_ID}/sessions/${SESSION_ID}/stop`,
      {
        body: { endedAt: '2026-07-01T11:00:00.000Z' },
      },
    );
  });

  it('fetches one session through the typed API client', async () => {
    const apiClientMock = {
      get: jest.fn(() => Promise.resolve(buildSessionResponse({ status: SessionStatus.ACTIVE }))),
    };

    const sessionsApi = createSessionsApi(apiClientMock as never);

    await expect(sessionsApi.getSession(USER_ID, SESSION_ID)).resolves.toMatchObject({
      id: SESSION_ID,
      status: SessionStatus.ACTIVE,
    });

    expect(apiClientMock.get).toHaveBeenCalledWith(`/users/${USER_ID}/sessions/${SESSION_ID}`);
  });

  it('builds the absolute receipt URL from the configured API base URL', () => {
    expect(buildReceiptUrl(USER_ID, SESSION_ID)).toBe(
      `http://localhost:3000/users/${USER_ID}/sessions/${SESSION_ID}/receipt`,
    );
  });
});
