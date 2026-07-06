import type { MostConfidentStatusResponse } from '@lilocharge/shared-types';
import { useEffect, useState } from 'react';

import { stationsApi } from './stations-api';

/** Map of connector id to its most confident community-reported status. */
export type ConnectorCommunityStatusMap = Readonly<Record<string, MostConfidentStatusResponse>>;

/** Minimal API surface needed to resolve community-reported connector statuses. */
export interface ConnectorCommunityStatusClient {
  getConnectorCommunityStatus(connectorId: string): Promise<MostConfidentStatusResponse | null>;
}

/** Translator signature accepted by the community status hint formatter. */
export type CommunityStatusTranslator = (
  key: string,
  options?: Readonly<Record<string, number | string>>,
) => string;

const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Loads community-reported statuses for the given connectors in parallel,
 * silently dropping connectors whose lookup fails or has no reports yet.
 */
export async function fetchConnectorCommunityStatuses(
  connectorIds: readonly string[],
  client: ConnectorCommunityStatusClient,
): Promise<ConnectorCommunityStatusMap> {
  const results = await Promise.all(
    connectorIds.map(async (connectorId: string): Promise<MostConfidentStatusResponse | null> => {
      try {
        return await client.getConnectorCommunityStatus(connectorId);
      } catch {
        return null;
      }
    }),
  );

  const statusByConnectorId: Record<string, MostConfidentStatusResponse> = {};

  for (const result of results) {
    if (result !== null && result !== undefined) {
      statusByConnectorId[result.connectorId] = result;
    }
  }

  return statusByConnectorId;
}

/**
 * React hook resolving community-reported statuses for a set of connectors.
 * Lookup failures are tolerated silently so screens simply omit the hint.
 */
export function useConnectorCommunityStatuses(
  connectorIds: readonly string[],
  client: ConnectorCommunityStatusClient = stationsApi,
): ConnectorCommunityStatusMap {
  const [statuses, setStatuses] = useState<ConnectorCommunityStatusMap>({});
  const connectorIdsKey = connectorIds.join(',');

  useEffect(() => {
    setStatuses((previousStatuses: ConnectorCommunityStatusMap): ConnectorCommunityStatusMap => {
      return Object.keys(previousStatuses).length === 0 ? previousStatuses : {};
    });

    if (connectorIdsKey.length === 0) {
      return;
    }

    let isCancelled = false;

    void fetchConnectorCommunityStatuses(connectorIdsKey.split(','), client).then(
      (statusByConnectorId: ConnectorCommunityStatusMap): void => {
        if (!isCancelled && Object.keys(statusByConnectorId).length > 0) {
          setStatuses(statusByConnectorId);
        }
      },
    );

    return (): void => {
      isCancelled = true;
    };
  }, [connectorIdsKey, client]);

  return statuses;
}

/**
 * Formats one community-reported status into a compact localized hint line,
 * e.g. "Community reported: Available · 87% confidence · 5 min ago".
 */
export function formatCommunityStatusHint(
  communityStatus: MostConfidentStatusResponse,
  statusLabel: string,
  t: CommunityStatusTranslator,
  nowMs: number = Date.now(),
): string {
  const confidencePercent = Math.round(communityStatus.confidenceScore * 100);
  const minutesAgo = resolveMinutesSince(communityStatus.latestUpdate.createdAt, nowMs);
  const timeAgo =
    minutesAgo < 1
      ? t('stations.confidence.justNow')
      : t('stations.confidence.minutesAgo', { minutes: minutesAgo });

  return t('stations.confidence.summary', {
    confidence: confidencePercent,
    status: statusLabel,
    timeAgo,
  });
}

/**
 * Computes whole minutes elapsed since an ISO timestamp, clamped at zero.
 */
function resolveMinutesSince(isoTimestamp: string, nowMs: number): number {
  const reportedAtMs = Date.parse(isoTimestamp);

  if (Number.isNaN(reportedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((nowMs - reportedAtMs) / MILLISECONDS_PER_MINUTE));
}
