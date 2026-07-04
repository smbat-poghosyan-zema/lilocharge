import type { AuthTokenPairResponse } from '@lilocharge/shared-types';
import { MMKV } from 'react-native-mmkv';

const ONBOARDING_SESSION_STORAGE_KEY = 'onboarding.session.v1';

interface MmkvStorageDriver {
  delete(key: string): void;
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** Auth/session fields persisted across app cold starts. */
export interface PersistedOnboardingSession {
  readonly accessToken: string | null;
  readonly onboardingComplete: boolean;
  readonly refreshToken: string | null;
  readonly userId: string | null;
}

/** Listener invoked whenever the persisted session is mutated. */
export type SessionChangeListener = () => void;

/** Contract for persisted onboarding session storage operations. */
export interface SessionStorage {
  readonly clearSession: () => void;
  readonly getAccessToken: () => string | null;
  readonly readSession: () => PersistedOnboardingSession;
  readonly setOnboardingComplete: (onboardingComplete: boolean) => void;
  readonly setTokenPair: (
    tokenPair: Pick<AuthTokenPairResponse, 'accessToken' | 'refreshToken'>,
    userId: string | null,
  ) => void;
  readonly subscribe: (listener: SessionChangeListener) => () => void;
}

const EMPTY_SESSION: PersistedOnboardingSession = {
  accessToken: null,
  onboardingComplete: false,
  refreshToken: null,
  userId: null,
};

/**
 * Creates an MMKV-backed onboarding session storage adapter.
 */
export function createSessionStorage(driver: MmkvStorageDriver): SessionStorage {
  const listeners = new Set<SessionChangeListener>();

  /**
   * Reads and validates the persisted session record from JSON state.
   */
  const readSession = (): PersistedOnboardingSession => {
    const rawValue = driver.getString(ONBOARDING_SESSION_STORAGE_KEY);

    if (rawValue === undefined) {
      return EMPTY_SESSION;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;

      return normalizePersistedSession(parsed);
    } catch {
      return EMPTY_SESSION;
    }
  };

  /**
   * Writes the session record and notifies subscribers.
   */
  const writeSession = (session: PersistedOnboardingSession): void => {
    driver.set(ONBOARDING_SESSION_STORAGE_KEY, JSON.stringify(session));
    emitChange(listeners);
  };

  return {
    clearSession: (): void => {
      driver.delete(ONBOARDING_SESSION_STORAGE_KEY);
      emitChange(listeners);
    },

    getAccessToken: (): string | null => {
      return readSession().accessToken;
    },

    readSession,

    setOnboardingComplete: (onboardingComplete: boolean): void => {
      writeSession({
        ...readSession(),
        onboardingComplete,
      });
    },

    setTokenPair: (
      tokenPair: Pick<AuthTokenPairResponse, 'accessToken' | 'refreshToken'>,
      userId: string | null,
    ): void => {
      writeSession({
        ...readSession(),
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        userId,
      });
    },

    subscribe: (listener: SessionChangeListener): (() => void) => {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}

const defaultSessionMmkvStorage = new MMKV({
  id: 'lilocharge-onboarding-session',
});

/** Shared app-wide onboarding session storage singleton. */
export const onboardingSessionStorage = createSessionStorage(defaultSessionMmkvStorage);

/**
 * Reads the persisted access token for API client bearer authentication.
 */
export function getPersistedAccessToken(): string | null {
  return onboardingSessionStorage.getAccessToken();
}

/**
 * Clears the persisted session, used when the API reports the token is no longer valid.
 */
export function clearPersistedSession(): void {
  onboardingSessionStorage.clearSession();
}

/**
 * Emits a single change event to all active storage subscribers.
 */
function emitChange(listeners: ReadonlySet<SessionChangeListener>): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Converts runtime JSON data into a validated persisted session record.
 */
function normalizePersistedSession(value: unknown): PersistedOnboardingSession {
  if (!isRecord(value)) {
    return EMPTY_SESSION;
  }

  return {
    accessToken: normalizeNullableString(value.accessToken),
    onboardingComplete: value.onboardingComplete === true,
    refreshToken: normalizeNullableString(value.refreshToken),
    userId: normalizeNullableString(value.userId),
  };
}

/**
 * Normalizes an unknown JSON field into a non-empty string or null.
 */
function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Type guard that validates an object-like unknown value.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
