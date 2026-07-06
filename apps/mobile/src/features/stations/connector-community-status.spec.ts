import type { MostConfidentStatusResponse } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';

import {
  fetchConnectorCommunityStatuses,
  formatCommunityStatusHint,
} from './connector-community-status';

const NOW_MS = Date.parse('2026-07-06T12:00:00.000Z');

/**
 * Builds a community-reported status fixture for one connector.
 */
function buildCommunityStatus(
  connectorId: string,
  createdAt: string,
  confidenceScore = 0.87,
): MostConfidentStatusResponse {
  return {
    confidenceScore,
    connectorId,
    latestUpdate: {
      comment: null,
      confidenceScore: 0.95,
      connectorId,
      createdAt,
      id: '77777777-7777-7777-7777-777777777777',
      status: StationStatus.AVAILABLE,
      updatedAt: createdAt,
      userId: 'user-9',
    },
    status: StationStatus.AVAILABLE,
  };
}

describe('fetchConnectorCommunityStatuses', () => {
  it('collects statuses for all connectors in parallel keyed by connector id', async () => {
    const firstStatus = buildCommunityStatus('connector-1', '2026-07-06T11:55:00.000Z');
    const client = {
      getConnectorCommunityStatus: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(
        (connectorId: string) => {
          return Promise.resolve(connectorId === 'connector-1' ? firstStatus : null);
        },
      ),
    };

    await expect(
      fetchConnectorCommunityStatuses(['connector-1', 'connector-2'], client),
    ).resolves.toEqual({
      'connector-1': firstStatus,
    });

    expect(client.getConnectorCommunityStatus).toHaveBeenCalledTimes(2);
    expect(client.getConnectorCommunityStatus).toHaveBeenCalledWith('connector-1');
    expect(client.getConnectorCommunityStatus).toHaveBeenCalledWith('connector-2');
  });

  it('tolerates lookup failures silently and keeps successful results', async () => {
    const secondStatus = buildCommunityStatus('connector-2', '2026-07-06T11:30:00.000Z');
    const client = {
      getConnectorCommunityStatus: jest.fn<Promise<MostConfidentStatusResponse | null>, [string]>(
        (connectorId: string) => {
          if (connectorId === 'connector-1') {
            return Promise.reject(new Error('network down'));
          }

          return Promise.resolve(secondStatus);
        },
      ),
    };

    await expect(
      fetchConnectorCommunityStatuses(['connector-1', 'connector-2'], client),
    ).resolves.toEqual({
      'connector-2': secondStatus,
    });
  });
});

describe('formatCommunityStatusHint', () => {
  const translate = (key: string, options?: Readonly<Record<string, number | string>>): string => {
    if (key === 'stations.confidence.justNow') {
      return 'just now';
    }

    if (key === 'stations.confidence.minutesAgo') {
      return `${String(options?.minutes)} min ago`;
    }

    return `${String(options?.status)} · ${String(options?.confidence)}% · ${String(
      options?.timeAgo,
    )}`;
  };

  it('formats status, rounded confidence percent, and minutes ago', () => {
    const communityStatus = buildCommunityStatus(
      'connector-1',
      '2026-07-06T11:55:00.000Z',
      0.874,
    );

    expect(formatCommunityStatusHint(communityStatus, 'Available', translate, NOW_MS)).toBe(
      'Available · 87% · 5 min ago',
    );
  });

  it('uses the just-now label for reports younger than one minute', () => {
    const communityStatus = buildCommunityStatus('connector-1', '2026-07-06T11:59:30.000Z', 1);

    expect(formatCommunityStatusHint(communityStatus, 'Available', translate, NOW_MS)).toBe(
      'Available · 100% · just now',
    );
  });

  it('clamps future timestamps and invalid dates to zero minutes', () => {
    const futureStatus = buildCommunityStatus('connector-1', '2026-07-06T12:10:00.000Z');
    const invalidStatus = buildCommunityStatus('connector-1', 'not-a-date');

    expect(formatCommunityStatusHint(futureStatus, 'Available', translate, NOW_MS)).toContain(
      'just now',
    );
    expect(formatCommunityStatusHint(invalidStatus, 'Available', translate, NOW_MS)).toContain(
      'just now',
    );
  });
});
