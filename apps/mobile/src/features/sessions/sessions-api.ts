import type {
  CreateSessionRequest,
  SessionResponse,
  StartSessionRequest,
  StopSessionRequest,
} from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from '../onboarding/session-storage';

/** Typed API contract for charging-session lifecycle operations. */
export interface SessionsApi {
  createSession(userId: string, request: CreateSessionRequest): Promise<SessionResponse>;
  getSession(userId: string, sessionId: string): Promise<SessionResponse>;
  startSession(
    userId: string,
    sessionId: string,
    request?: StartSessionRequest,
  ): Promise<SessionResponse>;
  stopSession(
    userId: string,
    sessionId: string,
    request?: StopSessionRequest,
  ): Promise<SessionResponse>;
}

/** Creates charging-session API helpers backed by the shared typed ApiClient. */
export function createSessionsApi(apiClient: ApiClient): SessionsApi {
  return {
    createSession: (userId: string, request: CreateSessionRequest): Promise<SessionResponse> => {
      return apiClient.post<SessionResponse, CreateSessionRequest>(`/users/${userId}/sessions`, {
        body: request,
      });
    },
    getSession: (userId: string, sessionId: string): Promise<SessionResponse> => {
      return apiClient.get<SessionResponse>(`/users/${userId}/sessions/${sessionId}`);
    },
    startSession: (
      userId: string,
      sessionId: string,
      request: StartSessionRequest = {},
    ): Promise<SessionResponse> => {
      return apiClient.post<SessionResponse, StartSessionRequest>(
        `/users/${userId}/sessions/${sessionId}/start`,
        {
          body: request,
        },
      );
    },
    stopSession: (
      userId: string,
      sessionId: string,
      request: StopSessionRequest = {},
    ): Promise<SessionResponse> => {
      return apiClient.post<SessionResponse, StopSessionRequest>(
        `/users/${userId}/sessions/${sessionId}/stop`,
        {
          body: request,
        },
      );
    },
  };
}

/**
 * Builds the absolute URL of one charging-session PDF receipt.
 */
export function buildReceiptUrl(userId: string, sessionId: string): string {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, '');

  return `${baseUrl}/users/${userId}/sessions/${sessionId}/receipt`;
}

const defaultSessionsApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/** Default sessions API instance for charging lifecycle operations. */
export const sessionsApi = createSessionsApi(defaultSessionsApiClient);
