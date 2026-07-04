import { createSessionStorage, type PersistedOnboardingSession } from './session-storage';

/**
 * Builds an in-memory MMKV-compatible driver for storage tests.
 */
function createDriverMock(): {
  delete(key: string): void;
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  readonly valueByKey: Map<string, string>;
} {
  const valueByKey = new Map<string, string>();

  return {
    delete: (key: string): void => {
      valueByKey.delete(key);
    },
    getString: (key: string): string | undefined => {
      return valueByKey.get(key);
    },
    set: (key: string, value: string): void => {
      valueByKey.set(key, value);
    },
    valueByKey,
  };
}

const EMPTY_SESSION: PersistedOnboardingSession = {
  accessToken: null,
  onboardingComplete: false,
  refreshToken: null,
  userId: null,
};

describe('session storage', () => {
  it('returns an empty session when nothing is persisted', () => {
    const storage = createSessionStorage(createDriverMock());

    expect(storage.readSession()).toEqual(EMPTY_SESSION);
    expect(storage.getAccessToken()).toBeNull();
  });

  it('persists and reads back a token pair with user id', () => {
    const storage = createSessionStorage(createDriverMock());

    storage.setTokenPair(
      { accessToken: 'access-token', refreshToken: 'refresh-token' },
      'user-1',
    );

    expect(storage.readSession()).toEqual({
      accessToken: 'access-token',
      onboardingComplete: false,
      refreshToken: 'refresh-token',
      userId: 'user-1',
    });
    expect(storage.getAccessToken()).toBe('access-token');
  });

  it('persists onboarding completion independently of tokens', () => {
    const storage = createSessionStorage(createDriverMock());

    storage.setTokenPair({ accessToken: 'access-token', refreshToken: 'refresh-token' }, 'user-1');
    storage.setOnboardingComplete(true);

    expect(storage.readSession()).toEqual({
      accessToken: 'access-token',
      onboardingComplete: true,
      refreshToken: 'refresh-token',
      userId: 'user-1',
    });
  });

  it('clears the persisted session', () => {
    const storage = createSessionStorage(createDriverMock());

    storage.setTokenPair({ accessToken: 'access-token', refreshToken: 'refresh-token' }, 'user-1');
    storage.setOnboardingComplete(true);
    storage.clearSession();

    expect(storage.readSession()).toEqual(EMPTY_SESSION);
    expect(storage.getAccessToken()).toBeNull();
  });

  it('returns an empty session when persisted JSON is corrupt', () => {
    const driver = createDriverMock();
    driver.set('onboarding.session.v1', '{not-valid-json');

    const storage = createSessionStorage(driver);

    expect(storage.readSession()).toEqual(EMPTY_SESSION);
  });

  it('normalizes malformed persisted fields to safe defaults', () => {
    const driver = createDriverMock();
    driver.set(
      'onboarding.session.v1',
      JSON.stringify({
        accessToken: 42,
        onboardingComplete: 'yes',
        refreshToken: '',
        userId: null,
      }),
    );

    const storage = createSessionStorage(driver);

    expect(storage.readSession()).toEqual(EMPTY_SESSION);
  });

  it('notifies subscribers on every mutation and stops after unsubscribe', () => {
    const storage = createSessionStorage(createDriverMock());
    const listener = jest.fn<void, []>();

    const unsubscribe = storage.subscribe(listener);

    storage.setTokenPair({ accessToken: 'access-token', refreshToken: 'refresh-token' }, null);
    storage.setOnboardingComplete(true);
    storage.clearSession();

    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    storage.setOnboardingComplete(false);

    expect(listener).toHaveBeenCalledTimes(3);
  });
});
