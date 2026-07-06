/** Supported payment gateway identifiers shared across API and mobile clients. */
export type PaymentGatewayCode = 'APPLE_PAY' | 'ARCA' | 'GOOGLE_PAY' | 'IDRAM' | 'WALLET';

/** Persisted payment-method payload returned by payment setup endpoints. */
export interface PaymentMethodResponse {
  readonly createdAt: string;
  readonly expiryMonth: number | null;
  readonly expiryYear: number | null;
  readonly gateway: PaymentGatewayCode;
  readonly id: string;
  readonly isDefault: boolean;
  readonly last4: string | null;
  readonly updatedAt: string;
  readonly userId: string;
}

/** Request payload used to exchange one Apple Pay token for a storable payment-method token. */
export interface ExchangeApplePayTokenRequest {
  readonly cardLast4?: string;
  readonly isDefault?: boolean;
  readonly paymentToken: string;
  readonly transactionIdentifier: string;
}

/** Request payload used to exchange one Google Pay token for a storable payment-method token. */
export interface ExchangeGooglePayTokenRequest {
  readonly cardLast4?: string;
  readonly isDefault?: boolean;
  readonly paymentToken: string;
  readonly transactionIdentifier: string;
}

/** Payment lifecycle status reported by gateway webhook/callback notifications. */
export type PaymentWebhookStatus = 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';

/**
 * Callback body posted by ArCa/Idram gateway webhooks to the payments API.
 * `orderId` carries the merchant order id sent on the original gateway request
 * (the charging session id for session payments), and `amount` is in AMD minor units.
 */
export interface PaymentGatewayWebhookPayload {
  readonly amount: number;
  readonly gatewayTransactionId: string;
  readonly orderId: string;
  readonly status: PaymentWebhookStatus;
}

/** Acknowledgement body returned to gateways after a webhook is accepted. */
export interface PaymentWebhookAckResponse {
  readonly received: true;
}
