import type { CreateProblemReportRequest, ProblemReportResponse } from '@lilocharge/shared-types';

import { createApiClient, type ApiClient } from '../../api';
import { getApiBaseUrl } from '../../config/runtime';
import { clearPersistedSession, getPersistedAccessToken } from '../onboarding/session-storage';

/** Typed API contract for station problem-report submissions. */
export interface ProblemReportsApi {
  createProblemReport(
    userId: string,
    request: CreateProblemReportRequest,
  ): Promise<ProblemReportResponse>;
}

/** Creates problem-report API helpers backed by the shared typed ApiClient. */
export function createProblemReportsApi(apiClient: ApiClient): ProblemReportsApi {
  return {
    createProblemReport: (
      userId: string,
      request: CreateProblemReportRequest,
    ): Promise<ProblemReportResponse> => {
      return apiClient.post<ProblemReportResponse, CreateProblemReportRequest>(
        `/users/${userId}/problem-reports`,
        {
          body: request,
        },
      );
    },
  };
}

const defaultProblemReportsApiClient = createApiClient({
  baseUrl: getApiBaseUrl(),
  defaultHeaders: {
    Accept: 'application/json',
  },
  getAccessToken: (): string | null => getPersistedAccessToken(),
  onUnauthorized: (): void => {
    clearPersistedSession();
  },
});

/** Default problem-reports API instance for station issue submissions. */
export const problemReportsApi = createProblemReportsApi(defaultProblemReportsApiClient);
