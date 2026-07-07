import type { CreateProblemReportRequest, ProblemReportResponse } from '@lilocharge/shared-types';

import type { ApiClient } from '../../api';
import { createAuthenticatedApiClient } from '../onboarding/authenticated-api-client';

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

const defaultProblemReportsApiClient = createAuthenticatedApiClient();

/** Default problem-reports API instance for station issue submissions. */
export const problemReportsApi = createProblemReportsApi(defaultProblemReportsApiClient);
