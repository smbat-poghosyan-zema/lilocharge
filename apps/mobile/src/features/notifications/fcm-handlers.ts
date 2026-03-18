import {
  PushNotificationEventType,
  type PushNotificationDataPayload,
} from '@lilocharge/shared-types';

/** Lightweight remote-message contract consumed by mobile FCM handler utilities. */
export interface FcmRemoteMessage {
  readonly data?: Readonly<Record<string, string | undefined>>;
}

/** Callback hooks used to handle parsed notification events in UI/state layers. */
export interface FcmEventHandlers {
  readonly onPaymentFailed?: (payload: PushNotificationDataPayload) => void;
  readonly onPaymentSucceeded?: (payload: PushNotificationDataPayload) => void;
  readonly onSessionCompleted?: (payload: PushNotificationDataPayload) => void;
  readonly onSessionStarted?: (payload: PushNotificationDataPayload) => void;
}

/** Parses one FCM data payload into strongly typed notification metadata for event handlers. */
export function parseFcmNotificationData(
  data: Readonly<Record<string, string | undefined>> | undefined,
): PushNotificationDataPayload | null {
  if (data === undefined) {
    return null;
  }

  const eventType = data.eventType;
  const sessionId = data.sessionId?.trim();
  const userId = data.userId?.trim();

  if (!isPushNotificationEventType(eventType) || sessionId === undefined || userId === undefined) {
    return null;
  }

  if (sessionId.length === 0 || userId.length === 0) {
    return null;
  }

  const optionalFields: {
    failureReason?: string;
    paymentAmountAmd?: number;
    totalCostAmd?: number;
  } = {};

  const totalCostAmd = parseOptionalNumber(data.totalCostAmd);
  if (totalCostAmd !== undefined) {
    optionalFields.totalCostAmd = totalCostAmd;
  }

  const paymentAmountAmd = parseOptionalNumber(data.paymentAmountAmd);
  if (paymentAmountAmd !== undefined) {
    optionalFields.paymentAmountAmd = paymentAmountAmd;
  }

  const failureReason = data.failureReason?.trim();
  if (failureReason !== undefined && failureReason.length > 0) {
    optionalFields.failureReason = failureReason;
  }

  return {
    eventType,
    sessionId,
    userId,
    ...optionalFields,
  };
}

/** Parses and dispatches one remote FCM message to its matching callback, if provided. */
export function handleIncomingFcmMessage(
  message: FcmRemoteMessage,
  handlers: FcmEventHandlers,
): void {
  const payload = parseFcmNotificationData(message.data);

  if (payload === null) {
    return;
  }

  if (payload.eventType === PushNotificationEventType.SESSION_STARTED) {
    handlers.onSessionStarted?.(payload);
    return;
  }

  if (payload.eventType === PushNotificationEventType.SESSION_COMPLETED) {
    handlers.onSessionCompleted?.(payload);
    return;
  }

  if (payload.eventType === PushNotificationEventType.PAYMENT_SUCCEEDED) {
    handlers.onPaymentSucceeded?.(payload);
    return;
  }

  handlers.onPaymentFailed?.(payload);
}

/** Resolves whether one raw value maps to a known push notification event enum member. */
function isPushNotificationEventType(
  value: string | undefined,
): value is PushNotificationEventType {
  return (
    value === PushNotificationEventType.SESSION_STARTED ||
    value === PushNotificationEventType.SESSION_COMPLETED ||
    value === PushNotificationEventType.PAYMENT_SUCCEEDED ||
    value === PushNotificationEventType.PAYMENT_FAILED
  );
}

/** Parses one optional numeric string into a finite number when valid and non-negative. */
function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}
