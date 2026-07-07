import { buildCandidateEvseIds, resolveOcppConnectorNumber } from './ocpp.evse-id';

describe('ocpp.evse-id helpers', () => {
  describe('buildCandidateEvseIds', () => {
    it('produces the ordered evse-prefixed, hyphen-prefixed, and bare-number candidates', () => {
      expect(buildCandidateEvseIds('CP-001', 2)).toEqual(['CP-001-evse-2', 'CP-001-2', '2']);
    });
  });

  describe('resolveOcppConnectorNumber', () => {
    it('recovers the connector number from the evse-prefixed form', () => {
      expect(resolveOcppConnectorNumber('CP-001', 'CP-001-evse-2')).toBe(2);
    });

    it('recovers the connector number from the hyphen-prefixed form', () => {
      expect(resolveOcppConnectorNumber('CP-001', 'CP-001-2')).toBe(2);
    });

    it('recovers the connector number from the bare-number form', () => {
      expect(resolveOcppConnectorNumber('CP-001', '2')).toBe(2);
    });

    it('falls back to a trailing numeric segment for legacy evse ids', () => {
      expect(resolveOcppConnectorNumber('CP-001', 'legacy-evse-007')).toBe(7);
    });

    it('defaults to connector 1 when no numeric segment is present', () => {
      expect(resolveOcppConnectorNumber('CP-001', 'unparseable')).toBe(1);
    });
  });

  describe('round-trip', () => {
    it('resolves each built candidate back to the original connector number', () => {
      const chargePointId = 'CP-XYZ';

      for (const connectorId of [1, 2, 5, 42]) {
        for (const candidate of buildCandidateEvseIds(chargePointId, connectorId)) {
          expect(resolveOcppConnectorNumber(chargePointId, candidate)).toBe(connectorId);
        }
      }
    });
  });
});
