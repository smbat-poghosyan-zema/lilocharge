export interface WorkspaceBootstrapType {
  readonly initialized: boolean;
}

export type { AuthTokenPairResponse, PhoneOtpRequestResponse, SupportedLanguageCode } from './auth';
export type {
  ConnectorPricingCalculationRequest,
  ConnectorPricingCalculationResponse,
  UpdateConnectorStatusRequest,
} from './connector';
export type {
  ConnectorStatusUpdateResponse,
  CreateConnectorStatusUpdateRequest,
  ListConnectorStatusUpdatesQueryRequest,
  MostConfidentStatusResponse,
} from './connector-status-update';
export type {
  FavoriteStation,
  FavoriteStationSummary,
  UserFavoriteStationResponse,
} from './favorite';
export { PushNotificationEventType, PushNotificationPlatform } from './notification';
export type {
  PushNotificationDataPayload,
  RegisterPushTokenRequest,
  UnregisterPushTokenRequest,
} from './notification';
export type {
  ExchangeApplePayTokenRequest,
  ExchangeGooglePayTokenRequest,
  PaymentGatewayCode,
  PaymentGatewayWebhookPayload,
  PaymentMethodResponse,
  PaymentWebhookAckResponse,
  PaymentWebhookStatus,
  RegisterPaymentMethodRequest,
  TokenizedPaymentGatewayCode,
} from './payment';
export type {
  CreateReviewPhotoUploadRequest,
  CreateReviewPhotoUploadResponse,
  ReviewPhotoContentType,
  ReviewPhotoExtension,
} from './upload';
export type {
  CreateReviewRequest,
  ListReviewsQueryRequest,
  UpdateReviewRequest,
  UserReviewResponse,
} from './review';
export { ProblemType, ProblemReportStatus } from './problem-report';
export type {
  CreateProblemReportRequest,
  ListProblemReportsQueryRequest,
  ProblemReportResponse,
} from './problem-report';
export {
  SESSION_MONITOR_ERROR_EVENT,
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
} from './session-monitoring';
export type {
  SessionMonitorClientToServerEvents,
  SessionMonitorErrorEvent,
  SessionMonitorRoomRequest,
  SessionMonitorServerToClientEvents,
  SessionMonitorUpdateEvent,
} from './session-monitoring';
export { OcppAction } from './ocpp';
export type {
  OcppBootNotificationRequest,
  OcppBootNotificationResponse,
  OcppHeartbeatResponse,
  OcppMeterSampledValue,
  OcppMeterValue,
  OcppMeterValuesRequest,
  OcppRegistrationStatus,
  OcppRemoteStartTransactionRequest,
  OcppRemoteStartTransactionResponse,
  OcppRemoteStartTransactionResponseStatus,
  OcppRemoteStopTransactionRequest,
  OcppRemoteStopTransactionResponse,
  OcppRemoteStopTransactionResponseStatus,
  OcppStartTransactionRequest,
  OcppStartTransactionResponse,
  OcppStatusNotificationErrorCode,
  OcppStatusNotificationRequest,
  OcppStatusNotificationStatus,
  OcppStopTransactionRequest,
  OcppStopTransactionResponse,
} from './ocpp';
export { Ocpp2Action } from './ocpp2';
export type {
  Ocpp2AuthorizationStatus,
  Ocpp2AuthorizeRequest,
  Ocpp2AuthorizeResponse,
  Ocpp2BootNotificationRequest,
  Ocpp2BootNotificationResponse,
  Ocpp2BootReason,
  Ocpp2ChargingState,
  Ocpp2ChargingStation,
  Ocpp2ConnectorStatus,
  Ocpp2EVSE,
  Ocpp2HeartbeatResponse,
  Ocpp2IdToken,
  Ocpp2IdTokenInfo,
  Ocpp2MeterValue,
  Ocpp2MeterValuesRequest,
  Ocpp2MeterValuesResponse,
  Ocpp2RegistrationStatus,
  Ocpp2RequestStartStopStatus,
  Ocpp2RequestStartTransactionRequest,
  Ocpp2RequestStartTransactionResponse,
  Ocpp2RequestStopTransactionRequest,
  Ocpp2RequestStopTransactionResponse,
  Ocpp2SampledValue,
  Ocpp2StatusNotificationRequest,
  Ocpp2StatusNotificationResponse,
  Ocpp2Transaction,
  Ocpp2TransactionEventRequest,
  Ocpp2TransactionEventResponse,
  Ocpp2TransactionEventType,
  Ocpp2TriggerReason,
} from './ocpp2';
export { SessionStatus } from './session';
export type {
  CreateSessionRequest,
  SessionHistoryItem,
  SessionHistoryQuery,
  SessionHistoryResponse,
  SessionReceiptData,
  SessionResponse,
  StartSessionRequest,
  StopSessionRequest,
} from './session';
export {
  computeAggregateStationStatus,
  derivePowerTier,
  STATION_STATUS_PRIORITY,
  StationStatus,
} from './station';
export type {
  NearbyStationsQueryRequest,
  PowerTier,
  StationConnectorResponse,
  StationDetailQueryRequest,
  StationDetailResponse,
  StationNearbyResponse,
  StationPricingPlanResponse,
  StationReviewResponse,
  StationSearchQueryRequest,
} from './station';
export type {
  UpdateUserLanguageRequest,
  UpdateUserNotificationPreferencesRequest,
  UpdateUserProfileRequest,
  UserProfileResponse,
} from './user';
export { ConnectorType } from './vehicle';
export type { CreateVehicleRequest, UpdateVehicleRequest, VehicleResponse } from './vehicle';
export type {
  WalletResponse,
  WalletTopUpRequest,
  WalletTopUpResponse,
  WalletTransactionResponse,
  WalletTransactionsResponse,
  WalletTransactionType,
} from './wallet';

/** Standard API health-check payload shared across services and clients. */
export interface ApiHealthResponse {
  readonly status: 'ok';
  readonly service: string;
  readonly timestamp: string;
  readonly uptimeSeconds: number;
}

/** Standardized API error payload emitted by backend exception filters. */
export interface ApiErrorResponse {
  readonly statusCode: number;
  readonly message: string;
  readonly path: string;
  readonly timestamp: string;
  readonly requestId?: string;
}
