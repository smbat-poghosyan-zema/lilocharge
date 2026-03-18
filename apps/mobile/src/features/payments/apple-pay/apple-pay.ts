import { NativeModules, Platform } from 'react-native';

/** Native Apple Pay module contract bridged from iOS implementation. */
export interface ApplePayNativeModule {
  canMakePayments(): Promise<boolean> | boolean;
  presentPaymentSheet(
    request: ApplePayNativePaymentSheetRequest,
  ): Promise<ApplePayNativePaymentSheetResult> | ApplePayNativePaymentSheetResult;
}

/** Input used to present one native Apple Pay payment sheet. */
export interface ApplePayPaymentSheetRequest {
  readonly amount: number;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly lineItemLabel: string;
  readonly merchantDisplayName: string;
  readonly merchantIdentifier: string;
}

/** Result payload returned after successful Apple Pay sheet confirmation. */
export interface ApplePayPaymentTokenResult {
  readonly cardLast4: string | null;
  readonly paymentToken: string;
  readonly transactionIdentifier: string;
}

interface ApplePayNativePaymentSheetRequest {
  readonly amount: string;
  readonly countryCode: string;
  readonly currencyCode: string;
  readonly lineItemLabel: string;
  readonly merchantDisplayName: string;
  readonly merchantIdentifier: string;
}

interface ApplePayNativePaymentSheetResult {
  readonly cardLast4?: string;
  readonly paymentToken?: string;
  readonly transactionIdentifier?: string;
}

interface ApplePayAvailabilityOptions {
  readonly nativeModule?: ApplePayNativeModule | null;
  readonly platformOs?: string;
}

type ApplePayPresentOptions = ApplePayAvailabilityOptions;

/** Error thrown when Apple Pay is unavailable on the current device/runtime. */
export class ApplePayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApplePayUnavailableError';
  }
}

/**
 * Returns whether Apple Pay can be presented on the current device/runtime.
 */
export async function canPresentApplePaySheet(
  options?: ApplePayAvailabilityOptions,
): Promise<boolean> {
  const platformOs = options?.platformOs ?? Platform.OS;
  const nativeModule = options?.nativeModule ?? resolveApplePayNativeModule();

  if (platformOs !== 'ios' || nativeModule === null) {
    return false;
  }

  return Boolean(await nativeModule.canMakePayments());
}

/**
 * Presents the native Apple Pay payment sheet and returns one payment token payload.
 */
export async function presentApplePaySheet(
  request: ApplePayPaymentSheetRequest,
  options?: ApplePayPresentOptions,
): Promise<ApplePayPaymentTokenResult> {
  const platformOs = options?.platformOs ?? Platform.OS;
  const nativeModule = options?.nativeModule ?? resolveApplePayNativeModule();

  if (platformOs !== 'ios' || nativeModule === null) {
    throw new ApplePayUnavailableError('Apple Pay is unavailable on this device');
  }

  const payload = await nativeModule.presentPaymentSheet({
    amount: request.amount.toFixed(2),
    countryCode: request.countryCode,
    currencyCode: request.currencyCode,
    lineItemLabel: request.lineItemLabel,
    merchantDisplayName: request.merchantDisplayName,
    merchantIdentifier: request.merchantIdentifier,
  });

  return parseApplePayPaymentSheetResult(payload);
}

/** Resolves the iOS native module when available in React Native runtime. */
function resolveApplePayNativeModule(): ApplePayNativeModule | null {
  const moduleCandidate = (NativeModules as Record<string, unknown>).LiloApplePay;

  if (!isRecord(moduleCandidate)) {
    return null;
  }

  const canMakePayments = moduleCandidate.canMakePayments;
  const presentPaymentSheet = moduleCandidate.presentPaymentSheet;

  if (typeof canMakePayments !== 'function' || typeof presentPaymentSheet !== 'function') {
    return null;
  }

  return {
    canMakePayments: canMakePayments as ApplePayNativeModule['canMakePayments'],
    presentPaymentSheet: presentPaymentSheet as ApplePayNativeModule['presentPaymentSheet'],
  };
}

/** Parses one Apple Pay sheet result payload and validates required fields. */
function parseApplePayPaymentSheetResult(payload: unknown): ApplePayPaymentTokenResult {
  if (!isRecord(payload)) {
    throw new ApplePayUnavailableError('Apple Pay payment sheet returned invalid payload');
  }

  const paymentToken = readTrimmedString(payload, 'paymentToken');
  const transactionIdentifier = readTrimmedString(payload, 'transactionIdentifier');
  const cardLast4 = readTrimmedString(payload, 'cardLast4');

  if (paymentToken === null || transactionIdentifier === null) {
    throw new ApplePayUnavailableError('Apple Pay payment sheet returned invalid payload');
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
