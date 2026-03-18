import { NativeModules, Platform } from 'react-native';

/** Native Google Pay module contract bridged from Android implementation. */
export interface GooglePayNativeModule {
  isReadyToPay(): Promise<boolean> | boolean;
  presentPaymentSheet(
    request: GooglePayNativePaymentSheetRequest,
  ): Promise<GooglePayNativePaymentSheetResult> | GooglePayNativePaymentSheetResult;
}

/** Input used to present one native Google Pay payment sheet. */
export interface GooglePayPaymentSheetRequest {
  readonly amount: number;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly lineItemLabel: string;
  readonly merchantDisplayName: string;
  readonly merchantIdentifier: string;
}

/** Result payload returned after successful Google Pay sheet confirmation. */
export interface GooglePayPaymentTokenResult {
  readonly cardLast4: string | null;
  readonly paymentToken: string;
  readonly transactionIdentifier: string;
}

interface GooglePayNativePaymentSheetRequest {
  readonly amount: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly lineItemLabel: string;
  readonly merchantDisplayName: string;
  readonly merchantIdentifier: string;
}

interface GooglePayNativePaymentSheetResult {
  readonly cardLast4?: string;
  readonly paymentToken?: string;
  readonly transactionIdentifier?: string;
}

interface GooglePayAvailabilityOptions {
  readonly nativeModule?: GooglePayNativeModule | null;
  readonly platformOs?: string;
}

type GooglePayPresentOptions = GooglePayAvailabilityOptions;

/** Error thrown when Google Pay is unavailable on the current device/runtime. */
export class GooglePayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GooglePayUnavailableError';
  }
}

/**
 * Returns whether Google Pay can be presented on the current device/runtime.
 */
export async function canPresentGooglePaySheet(
  options?: GooglePayAvailabilityOptions,
): Promise<boolean> {
  const platformOs = options?.platformOs ?? Platform.OS;
  const nativeModule = options?.nativeModule ?? resolveGooglePayNativeModule();

  if (platformOs !== 'android' || nativeModule === null) {
    return false;
  }

  return Boolean(await nativeModule.isReadyToPay());
}

/**
 * Presents the native Google Pay payment sheet and returns one payment token payload.
 */
export async function presentGooglePaySheet(
  request: GooglePayPaymentSheetRequest,
  options?: GooglePayPresentOptions,
): Promise<GooglePayPaymentTokenResult> {
  const platformOs = options?.platformOs ?? Platform.OS;
  const nativeModule = options?.nativeModule ?? resolveGooglePayNativeModule();

  if (platformOs !== 'android' || nativeModule === null) {
    throw new GooglePayUnavailableError('Google Pay is unavailable on this device');
  }

  const payload = await nativeModule.presentPaymentSheet({
    amount: request.amount.toFixed(2),
    countryCode: request.countryCode,
    currencyCode: request.currencyCode,
    lineItemLabel: request.lineItemLabel,
    merchantDisplayName: request.merchantDisplayName,
    merchantIdentifier: request.merchantIdentifier,
  });

  return parseGooglePayPaymentSheetResult(payload);
}

/** Resolves the Android native module when available in React Native runtime. */
function resolveGooglePayNativeModule(): GooglePayNativeModule | null {
  const moduleCandidate = (NativeModules as Record<string, unknown>).LiloGooglePay;

  if (!isRecord(moduleCandidate)) {
    return null;
  }

  const isReadyToPay = moduleCandidate.isReadyToPay;
  const presentPaymentSheet = moduleCandidate.presentPaymentSheet;

  if (typeof isReadyToPay !== 'function' || typeof presentPaymentSheet !== 'function') {
    return null;
  }

  return {
    isReadyToPay: isReadyToPay as GooglePayNativeModule['isReadyToPay'],
    presentPaymentSheet: presentPaymentSheet as GooglePayNativeModule['presentPaymentSheet'],
  };
}

/** Parses one Google Pay sheet result payload and validates required fields. */
function parseGooglePayPaymentSheetResult(payload: unknown): GooglePayPaymentTokenResult {
  if (!isRecord(payload)) {
    throw new GooglePayUnavailableError('Google Pay payment sheet returned invalid payload');
  }

  const paymentToken = readTrimmedString(payload, 'paymentToken');
  const transactionIdentifier = readTrimmedString(payload, 'transactionIdentifier');
  const cardLast4 = readTrimmedString(payload, 'cardLast4');

  if (paymentToken === null || transactionIdentifier === null) {
    throw new GooglePayUnavailableError('Google Pay payment sheet returned invalid payload');
  }

  return {
    cardLast4,
    paymentToken,
    transactionIdentifier,
  };
}

/** Type guard for unknown values expected to be plain object maps. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads one object property as trimmed string when available and non-empty. */
function readTrimmedString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}
