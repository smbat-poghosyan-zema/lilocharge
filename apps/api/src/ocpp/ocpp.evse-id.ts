/**
 * Shared helpers mapping between OCPP connector numbers and persisted connector EVSE ids.
 *
 * A charge point's identity is its `station.operatorId`; a connector resolves via a small,
 * ordered set of EVSE id candidates. `buildCandidateEvseIds` produces those candidates for
 * inbound OCPP message resolution, and `resolveOcppConnectorNumber` is its inverse, recovering
 * the connector number from a persisted EVSE id. Both must stay in lock-step: the exact string
 * forms below are what resolve real seeded/imported connectors, so changing them breaks OCPP.
 */

/**
 * Builds the ordered EVSE id candidates for one charge point / connector number:
 * `{chargePointId}-evse-{n}`, `{chargePointId}-{n}`, then the bare number.
 */
export function buildCandidateEvseIds(
  chargePointId: string,
  ocppConnectorId: number,
): readonly string[] {
  const connectorId = String(ocppConnectorId);

  return [`${chargePointId}-evse-${connectorId}`, `${chargePointId}-${connectorId}`, connectorId];
}

/**
 * Resolves the OCPP connector number for one connector by inverting the persisted EVSE id formats.
 *
 * This mirrors the candidate EVSE id formats produced by `buildCandidateEvseIds`:
 * `{chargePointId}-evse-{n}`, `{chargePointId}-{n}`, or a bare number. Legacy EVSE ids with a
 * trailing numeric segment fall back to that segment, and connector number 1 is used as the last
 * resort.
 */
export function resolveOcppConnectorNumber(chargePointId: string, evseId: string): number {
  const normalizedEvseId = evseId.trim();
  const prefixes = [`${chargePointId}-evse-`, `${chargePointId}-`];

  for (const prefix of prefixes) {
    if (normalizedEvseId.startsWith(prefix)) {
      const candidate = Number(normalizedEvseId.slice(prefix.length));
      if (Number.isInteger(candidate) && candidate > 0) {
        return candidate;
      }
    }
  }

  if (/^\d+$/.test(normalizedEvseId)) {
    const candidate = Number(normalizedEvseId);
    if (candidate > 0) {
      return candidate;
    }
  }

  const trailingNumberMatch = /-0*(\d+)$/.exec(normalizedEvseId);
  if (trailingNumberMatch !== null) {
    const candidate = Number(trailingNumberMatch[1]);
    if (candidate > 0) {
      return candidate;
    }
  }

  return 1;
}
