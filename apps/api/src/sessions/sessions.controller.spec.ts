import type {
  CreateSessionRequest,
  SessionHistoryQuery,
  SessionHistoryResponse,
  SessionResponse,
  StartSessionRequest,
  StopSessionRequest,
} from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';
import type { StreamableFile } from '@nestjs/common';

import type { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';

interface SessionsServiceMock {
  readonly createSession: jest.Mock<Promise<SessionResponse>, [string, CreateSessionRequest]>;
  readonly generateSessionReceipt: jest.Mock<Promise<StreamableFile>, [string, string]>;
  readonly getSessionById: jest.Mock<Promise<SessionResponse>, [string, string]>;
  readonly getSessionHistory: jest.Mock<
    Promise<SessionHistoryResponse>,
    [string, SessionHistoryQuery]
  >;
  readonly startSession: jest.Mock<Promise<SessionResponse>, [string, string, StartSessionRequest]>;
  readonly stopSession: jest.Mock<Promise<SessionResponse>, [string, string, StopSessionRequest]>;
}

const CONNECTOR_ID = '33333333-3333-3333-3333-333333333333';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const VEHICLE_ID = '44444444-4444-4444-4444-444444444444';

/** Builds one stable session response fixture for controller delegation tests. */
function buildSessionResponse(): SessionResponse {
  return {
    connectorId: CONNECTOR_ID,
    createdAt: '2026-02-17T12:00:00.000Z',
    endTime: null,
    energyDelivered: 0,
    id: SESSION_ID,
    peakPower: 0,
    startTime: null,
    status: SessionStatus.PENDING,
    totalCost: 0,
    transactionId: null,
    updatedAt: '2026-02-17T12:00:00.000Z',
    userId: USER_ID,
    vehicleId: VEHICLE_ID,
  };
}

describe('SessionsController', () => {
  it('delegates create, start, and stop lifecycle operations to sessions service methods', async () => {
    const sessionResponse = buildSessionResponse();
    const sessionsServiceMock: SessionsServiceMock = {
      createSession: jest
        .fn<Promise<SessionResponse>, [string, CreateSessionRequest]>()
        .mockResolvedValue(sessionResponse),
      generateSessionReceipt: jest.fn<Promise<StreamableFile>, [string, string]>(),
      getSessionById: jest.fn<Promise<SessionResponse>, [string, string]>(),
      getSessionHistory: jest.fn<Promise<SessionHistoryResponse>, [string, SessionHistoryQuery]>(),
      startSession: jest
        .fn<Promise<SessionResponse>, [string, string, StartSessionRequest]>()
        .mockResolvedValue({
          ...sessionResponse,
          startTime: '2026-02-17T12:05:00.000Z',
          status: SessionStatus.ACTIVE,
        }),
      stopSession: jest
        .fn<Promise<SessionResponse>, [string, string, StopSessionRequest]>()
        .mockResolvedValue({
          ...sessionResponse,
          endTime: '2026-02-17T12:35:00.000Z',
          startTime: '2026-02-17T12:05:00.000Z',
          status: SessionStatus.COMPLETED,
        }),
    };

    const controller = new SessionsController(sessionsServiceMock as unknown as SessionsService);

    const createPayload: CreateSessionRequest = {
      connectorId: CONNECTOR_ID,
      vehicleId: VEHICLE_ID,
    };
    const startPayload: StartSessionRequest = {
      startedAt: '2026-02-17T12:05:00.000Z',
    };
    const stopPayload: StopSessionRequest = {
      endedAt: '2026-02-17T12:35:00.000Z',
    };

    await expect(controller.createSession(USER_ID, createPayload)).resolves.toEqual(
      sessionResponse,
    );
    await expect(controller.startSession(USER_ID, SESSION_ID, startPayload)).resolves.toEqual({
      ...sessionResponse,
      startTime: '2026-02-17T12:05:00.000Z',
      status: SessionStatus.ACTIVE,
    });
    await expect(controller.stopSession(USER_ID, SESSION_ID, stopPayload)).resolves.toEqual({
      ...sessionResponse,
      endTime: '2026-02-17T12:35:00.000Z',
      startTime: '2026-02-17T12:05:00.000Z',
      status: SessionStatus.COMPLETED,
    });

    expect(sessionsServiceMock.createSession).toHaveBeenCalledWith(USER_ID, createPayload);
    expect(sessionsServiceMock.startSession).toHaveBeenCalledWith(
      USER_ID,
      SESSION_ID,
      startPayload,
    );
    expect(sessionsServiceMock.stopSession).toHaveBeenCalledWith(USER_ID, SESSION_ID, stopPayload);
  });

  it('delegates getSessionHistory to sessions service', async () => {
    const historyResponse: SessionHistoryResponse = {
      limit: 20,
      page: 1,
      sessions: [
        {
          connectorType: 'TYPE_2',
          createdAt: '2026-02-17T12:00:00.000Z',
          endTime: '2026-02-17T13:00:00.000Z',
          energyDelivered: 25.5,
          id: SESSION_ID,
          powerKw: 50,
          startTime: '2026-02-17T12:00:00.000Z',
          stationAddress: '123 Test St',
          stationName: 'Test Station',
          status: SessionStatus.COMPLETED,
          totalCost: 5000,
        },
      ],
      total: 1,
      totalPages: 1,
    };

    const sessionsServiceMock: SessionsServiceMock = {
      createSession: jest.fn<Promise<SessionResponse>, [string, CreateSessionRequest]>(),
      generateSessionReceipt: jest.fn<Promise<StreamableFile>, [string, string]>(),
      getSessionById: jest.fn<Promise<SessionResponse>, [string, string]>(),
      getSessionHistory: jest
        .fn<Promise<SessionHistoryResponse>, [string, SessionHistoryQuery]>()
        .mockResolvedValue(historyResponse),
      startSession: jest.fn<Promise<SessionResponse>, [string, string, StartSessionRequest]>(),
      stopSession: jest.fn<Promise<SessionResponse>, [string, string, StopSessionRequest]>(),
    };

    const controller = new SessionsController(sessionsServiceMock as unknown as SessionsService);
    const query: SessionHistoryQuery = { limit: 20, page: 1 };

    await expect(controller.getSessionHistory(USER_ID, query)).resolves.toEqual(historyResponse);
    expect(sessionsServiceMock.getSessionHistory).toHaveBeenCalledWith(USER_ID, query);
  });

  it('delegates getSessionById to sessions service', async () => {
    const sessionResponse = buildSessionResponse();
    const sessionsServiceMock: SessionsServiceMock = {
      createSession: jest.fn<Promise<SessionResponse>, [string, CreateSessionRequest]>(),
      generateSessionReceipt: jest.fn<Promise<StreamableFile>, [string, string]>(),
      getSessionById: jest
        .fn<Promise<SessionResponse>, [string, string]>()
        .mockResolvedValue(sessionResponse),
      getSessionHistory: jest.fn<Promise<SessionHistoryResponse>, [string, SessionHistoryQuery]>(),
      startSession: jest.fn<Promise<SessionResponse>, [string, string, StartSessionRequest]>(),
      stopSession: jest.fn<Promise<SessionResponse>, [string, string, StopSessionRequest]>(),
    };

    const controller = new SessionsController(sessionsServiceMock as unknown as SessionsService);

    await expect(controller.getSessionById(USER_ID, SESSION_ID)).resolves.toEqual(sessionResponse);
    expect(sessionsServiceMock.getSessionById).toHaveBeenCalledWith(USER_ID, SESSION_ID);
  });

  it('delegates getSessionReceipt to sessions service', async () => {
    const mockReceipt = {} as StreamableFile;
    const sessionsServiceMock: SessionsServiceMock = {
      createSession: jest.fn<Promise<SessionResponse>, [string, CreateSessionRequest]>(),
      generateSessionReceipt: jest
        .fn<Promise<StreamableFile>, [string, string]>()
        .mockResolvedValue(mockReceipt),
      getSessionById: jest.fn<Promise<SessionResponse>, [string, string]>(),
      getSessionHistory: jest.fn<Promise<SessionHistoryResponse>, [string, SessionHistoryQuery]>(),
      startSession: jest.fn<Promise<SessionResponse>, [string, string, StartSessionRequest]>(),
      stopSession: jest.fn<Promise<SessionResponse>, [string, string, StopSessionRequest]>(),
    };

    const controller = new SessionsController(sessionsServiceMock as unknown as SessionsService);

    await expect(controller.getSessionReceipt(USER_ID, SESSION_ID)).resolves.toEqual(mockReceipt);
    expect(sessionsServiceMock.generateSessionReceipt).toHaveBeenCalledWith(USER_ID, SESSION_ID);
  });
});
