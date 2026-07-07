import { normalizeRouteParam } from './route-params';

describe('normalizeRouteParam', () => {
  it('returns a trimmed string for a plain string value', () => {
    expect(normalizeRouteParam('  abc  ')).toBe('abc');
  });

  it('collapses an array param to its first element', () => {
    expect(normalizeRouteParam(['first', 'second'])).toBe('first');
  });

  it('returns null for undefined', () => {
    expect(normalizeRouteParam(undefined)).toBeNull();
  });

  it('returns null for a blank string', () => {
    expect(normalizeRouteParam('   ')).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(normalizeRouteParam([])).toBeNull();
  });
});
