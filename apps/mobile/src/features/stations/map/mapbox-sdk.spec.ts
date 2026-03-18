import { configureMapboxSdk, resetMapboxSdkConfigurationForTests } from './mapbox-sdk';

describe('configureMapboxSdk', () => {
  beforeEach(() => {
    resetMapboxSdkConfigurationForTests();
  });

  it('configures Mapbox once when a token is provided', () => {
    const setAccessToken = jest.fn<void, [string | null]>();

    expect(configureMapboxSdk('  test-mapbox-token  ', setAccessToken)).toBe(true);
    expect(configureMapboxSdk('new-token', setAccessToken)).toBe(false);
    expect(setAccessToken).toHaveBeenCalledTimes(1);
    expect(setAccessToken).toHaveBeenCalledWith('test-mapbox-token');
  });

  it('returns false when token is empty', () => {
    const setAccessToken = jest.fn<void, [string | null]>();

    expect(configureMapboxSdk(undefined, setAccessToken)).toBe(false);
    expect(configureMapboxSdk('   ', setAccessToken)).toBe(false);
    expect(setAccessToken).not.toHaveBeenCalled();
  });
});
