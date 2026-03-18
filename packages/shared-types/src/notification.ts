/** Supported device platform values for FCM push-token registration. */
export enum PushNotificationPlatform {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  WEB = 'WEB',
}

/** Supported event identifiers sent through push-notification payload metadata. */
export enum PushNotificationEventType {
  SESSION_STARTED = 'SESSION_STARTED',
  SESSION_COMPLETED = 'SESSION_COMPLETED',
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

/** Request payload for registering one user device token for push notifications. */
export interface RegisterPushTokenRequest {
  readonly platform: PushNotificationPlatform;
  readonly token: string;
}

/** Request payload for unregistering one user device token from push notifications. */
export interface UnregisterPushTokenRequest {
  readonly token: string;
}

/** Parsed push-notification data payload used by mobile FCM handlers. */
export interface PushNotificationDataPayload {
  readonly eventType: PushNotificationEventType;
  readonly failureReason?: string;
  readonly paymentAmountAmd?: number;
  readonly sessionId: string;
  readonly totalCostAmd?: number;
  readonly userId: string;
}
