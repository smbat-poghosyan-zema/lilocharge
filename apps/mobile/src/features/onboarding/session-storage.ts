import type { AuthTokenPairResponse } from '@lilocharge/shared-types';
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

const ONBOARDING_SESSION_STORAGE_KEY = 'onboarding.session.v1';
const SESSION_ENCRYPTION_KEY_SECURE_STORE_KEY = 'lilocharge.session.encryption-key.v1';
const LEGACY_SESSION_MMKV_ID = 'lilocharge-onboarding-session';
const ENCRYPTED_SESSION_MMKV_ID = 'lilocharge-onboarding-session-encrypted';

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

/**
 * Resolves (or lazily provisions) the MMKV encryption key from the device
 * secure enclave/keystore via expo-secure-store's synchronous accessors.
 */
function resolveSessionEncryptionKey(): string {
  const existingKey = SecureStore.getItem(SESSION_ENCRYPTION_KEY_SECURE_STORE_KEY);

  if (typeof existingKey === 'string' && existingKey.length > 0) {
    return existingKey;
  }

  const generatedKey = generateEncryptionKey();

  SecureStore.setItem(SESSION_ENCRYPTION_KEY_SECURE_STORE_KEY, generatedKey);

  return generatedKey;
}

/**
 * Generates a 64-character hex secret used as the MMKV encryption key.
 */
function generateEncryptionKey(): string {
  const globalCrypto = (globalThis as { readonly crypto?: Crypto }).crypto;

  if (globalCrypto?.getRandomValues) {
    const bytes = new Uint8Array(32);

    globalCrypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  let key = '';

  while (key.length < 64) {
    key += Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
  }

  return key.slice(0, 64);
}

/**
 * Best-effort migration of a plaintext session record into the encrypted store.
 *
 * Older builds persisted tokens to an unencrypted MMKV instance; on first run
 * of the encrypted store we copy any existing record over and wipe the
 * plaintext copy so tokens are no longer readable at rest.
 */
function migratePlaintextSession(encryptedDriver: MmkvStorageDriver): void {
  try {
    if (encryptedDriver.getString(ONBOARDING_SESSION_STORAGE_KEY) !== undefined) {
      return;
    }

    const legacyDriver = new MMKV({ id: LEGACY_SESSION_MMKV_ID });
    const legacyValue = legacyDriver.getString(ONBOARDING_SESSION_STORAGE_KEY);

    if (legacyValue !== undefined) {
      encryptedDriver.set(ONBOARDING_SESSION_STORAGE_KEY, legacyValue);
      legacyDriver.delete(ONBOARDING_SESSION_STORAGE_KEY);
    }
  } catch {
    // Migration is best-effort; a failure must never block session storage.
  }
}

/**
 * Builds the default encrypted session storage driver, falling back to an
 * unencrypted instance if secure-store or encrypted MMKV is unavailable.
 */
function createDefaultSessionDriver(): MmkvStorageDriver {
  try {
    const encryptionKey = resolveSessionEncryptionKey();
    const encryptedDriver = new MMKV({ encryptionKey, id: ENCRYPTED_SESSION_MMKV_ID });

    migratePlaintextSession(encryptedDriver);

    return encryptedDriver;
  } catch {
    return new MMKV({ id: LEGACY_SESSION_MMKV_ID });
  }
}

/** Shared app-wide onboarding session storage singleton. */
export const onboardingSessionStorage = createSessionStorage(createDefaultSessionDriver());

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
