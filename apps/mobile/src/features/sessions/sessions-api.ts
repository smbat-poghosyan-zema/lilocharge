import type {
  CreateSessionRequest,
  SessionResponse,
  StartSessionRequest,
  StopSessionRequest,
} from '@lilocharge/shared-types';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { createAuthenticatedApiClient } from '../onboarding/authenticated-api-client';
import { getPersistedAccessToken } from '../onboarding/session-storage';

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

/** Overridable dependencies for downloading and sharing a session receipt PDF. */
export interface ShareReceiptDeps {
  readonly cacheDirectory?: string | null;
  readonly downloadAsync?: typeof FileSystem.downloadAsync;
  readonly getAccessToken?: () => string | null;
  readonly isSharingAvailableAsync?: typeof Sharing.isAvailableAsync;
  readonly shareAsync?: typeof Sharing.shareAsync;
}

/**
 * Downloads the JWT-guarded session receipt PDF with the persisted access token
 * and opens the platform share sheet. The receipt endpoint is authenticated, so
 * the token must be attached via the request header (an external browser would
 * always 401); throwing surfaces a user-facing error state to the caller.
 */
export async function shareSessionReceipt(
  userId: string,
  sessionId: string,
  deps: ShareReceiptDeps = {},
): Promise<void> {
  const getAccessToken = deps.getAccessToken ?? getPersistedAccessToken;
  const downloadAsync = deps.downloadAsync ?? FileSystem.downloadAsync;
  const isSharingAvailableAsync = deps.isSharingAvailableAsync ?? Sharing.isAvailableAsync;
  const shareAsync = deps.shareAsync ?? Sharing.shareAsync;
  const cacheDirectory = deps.cacheDirectory ?? FileSystem.cacheDirectory;

  const accessToken = getAccessToken()?.trim();

  if (!accessToken) {
    throw new Error('Missing access token for receipt download');
  }

  if (!cacheDirectory) {
    throw new Error('No writable cache directory for receipt download');
  }

  const targetUri = `${cacheDirectory}lilocharge-receipt-${sessionId}.pdf`;
  const result = await downloadAsync(buildReceiptUrl(userId, sessionId), targetUri, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Receipt download failed with status ${result.status}`);
  }

  if (!(await isSharingAvailableAsync())) {
    throw new Error('Sharing is unavailable on this device');
  }

  await shareAsync(result.uri, {
    UTI: 'com.adobe.pdf',
    mimeType: 'application/pdf',
  });
}

const defaultSessionsApiClient = createAuthenticatedApiClient();

/** Default sessions API instance for charging lifecycle operations. */
export const sessionsApi = createSessionsApi(defaultSessionsApiClient);
