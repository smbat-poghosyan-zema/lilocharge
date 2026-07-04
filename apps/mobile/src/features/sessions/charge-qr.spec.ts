import { parseChargeQrPayload } from './charge-qr';

const CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';
const STATION_ID = '11111111-1111-1111-1111-111111111111';

describe('parseChargeQrPayload', () => {
  it('parses a raw connector UUID payload', () => {
    expect(parseChargeQrPayload(CONNECTOR_ID)).toEqual({
      connectorId: CONNECTOR_ID,
    });
  });

  it('trims surrounding whitespace and lowercases raw UUID payloads', () => {
    expect(parseChargeQrPayload(`  ${CONNECTOR_ID.toUpperCase()}\n`)).toEqual({
      connectorId: CONNECTOR_ID,
    });
  });

  it('parses a lilocharge deep link with connector id only', () => {
    expect(parseChargeQrPayload(`lilocharge://charge?connectorId=${CONNECTOR_ID}`)).toEqual({
      connectorId: CONNECTOR_ID,
    });
  });

  it('parses a lilocharge deep link with connector and station ids', () => {
    expect(
      parseChargeQrPayload(
        `lilocharge://charge?connectorId=${CONNECTOR_ID}&stationId=${STATION_ID}`,
      ),
    ).toEqual({
      connectorId: CONNECTOR_ID,
      stationId: STATION_ID,
    });
  });

  it('parses an https URL carrying the same query params', () => {
    expect(
      parseChargeQrPayload(
        `https://app.lilocharge.am/charge?connectorId=${CONNECTOR_ID}&stationId=${STATION_ID}`,
      ),
    ).toEqual({
      connectorId: CONNECTOR_ID,
      stationId: STATION_ID,
    });
  });

  it('parses an http URL carrying a connector id', () => {
    expect(parseChargeQrPayload(`http://lilocharge.am/qr?connectorId=${CONNECTOR_ID}`)).toEqual({
      connectorId: CONNECTOR_ID,
    });
  });

  it('ignores an invalid stationId while keeping a valid connectorId', () => {
    expect(
      parseChargeQrPayload(
        `lilocharge://charge?connectorId=${CONNECTOR_ID}&stationId=not-a-uuid`,
      ),
    ).toEqual({
      connectorId: CONNECTOR_ID,
    });
  });

  it('decodes URL-encoded query parameter values', () => {
    expect(
      parseChargeQrPayload(
        `https://lilocharge.am/charge?connectorId=${encodeURIComponent(CONNECTOR_ID)}`,
      ),
    ).toEqual({
      connectorId: CONNECTOR_ID,
    });
  });

  it.each([
    ['empty payload', ''],
    ['blank payload', '   '],
    ['arbitrary text', 'hello world'],
    ['malformed UUID', '22222222-2222-2222-2222-2222222222'],
    ['URL without connectorId', 'lilocharge://charge?stationId=' + STATION_ID],
    ['URL with invalid connectorId', 'lilocharge://charge?connectorId=abc'],
    ['unsupported scheme', `ftp://lilocharge.am/charge?connectorId=${CONNECTOR_ID}`],
    ['URL without query', 'https://lilocharge.am/charge'],
    ['malformed escape sequence', 'lilocharge://charge?connectorId=%E0%A4%A'],
  ])('returns null for %s', (_label: string, payload: string) => {
    expect(parseChargeQrPayload(payload)).toBeNull();
  });
});
