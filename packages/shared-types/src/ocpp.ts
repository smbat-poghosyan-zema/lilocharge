/** Supported OCPP actions exchanged between charge points and the central system. */
export enum OcppAction {
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  METER_VALUES = 'MeterValues',
  START_TRANSACTION = 'StartTransaction',
  STOP_TRANSACTION = 'StopTransaction',
  REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
  REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction',
}

/** OCPP registration statuses used by BootNotification responses. */
export type OcppRegistrationStatus = 'Accepted' | 'Pending' | 'Rejected';

/** OCPP 1.6-J BootNotification request payload. */
export interface OcppBootNotificationRequest {
  readonly chargePointVendor: string;
  readonly chargePointModel: string;
  readonly chargePointSerialNumber?: string;
  readonly chargeBoxSerialNumber?: string;
  readonly firmwareVersion?: string;
}

/** OCPP 1.6-J BootNotification response payload. */
export interface OcppBootNotificationResponse {
  readonly currentTime: string;
  readonly interval: number;
  readonly status: OcppRegistrationStatus;
}

/** OCPP 1.6-J Heartbeat response payload. */
export interface OcppHeartbeatResponse {
  readonly currentTime: string;
}

/** OCPP 1.6-J StatusNotification status values. */
export type OcppStatusNotificationStatus =
  | 'Available'
  | 'Preparing'
  | 'Charging'
  | 'SuspendedEVSE'
  | 'SuspendedEV'
  | 'Finishing'
  | 'Reserved'
  | 'Unavailable'
  | 'Faulted';

/** OCPP 1.6-J StatusNotification error code values. */
export type OcppStatusNotificationErrorCode =
  | 'NoError'
  | 'ConnectorLockFailure'
  | 'EVCommunicationError'
  | 'GroundFailure'
  | 'HighTemperature'
  | 'InternalError'
  | 'LocalListConflict'
  | 'OtherError'
  | 'OverCurrentFailure'
  | 'PowerMeterFailure'
  | 'PowerSwitchFailure'
  | 'ReaderFailure'
  | 'ResetFailure'
  | 'UnderVoltage'
  | 'OverVoltage'
  | 'WeakSignal';

/** OCPP 1.6-J StatusNotification request payload. */
export interface OcppStatusNotificationRequest {
  readonly connectorId: number;
  readonly errorCode: OcppStatusNotificationErrorCode;
  readonly status: OcppStatusNotificationStatus;
  readonly timestamp?: string;
}

/** One sampled meter value inside an OCPP MeterValues message. */
export interface OcppMeterSampledValue {
  readonly value: string;
  readonly context?: 'Sample.Periodic' | 'Sample.Clock' | 'Transaction.Begin' | 'Transaction.End';
  readonly measurand?:
    | 'Energy.Active.Import.Register'
    | 'Power.Active.Import'
    | 'Current.Import'
    | 'Voltage'
    | 'SoC';
  readonly unit?: 'Wh' | 'kWh' | 'W' | 'kW' | 'A' | 'V' | 'Percent';
}

/** One timestamped meter reading element inside an OCPP MeterValues message. */
export interface OcppMeterValue {
  readonly sampledValue: readonly OcppMeterSampledValue[];
  readonly timestamp: string;
}

/** OCPP 1.6-J MeterValues request payload. */
export interface OcppMeterValuesRequest {
  readonly connectorId: number;
  readonly meterValue: readonly OcppMeterValue[];
  readonly transactionId?: number;
}

/** OCPP 1.6-J StartTransaction request payload. */
export interface OcppStartTransactionRequest {
  readonly connectorId: number;
  readonly idTag: string;
  readonly meterStart: number;
  readonly reservationId?: number;
  readonly timestamp: string;
}

/** OCPP 1.6-J StartTransaction idTag status values returned by central systems. */
export type OcppStartTransactionIdTagStatus =
  | 'Accepted'
  | 'Blocked'
  | 'Expired'
  | 'Invalid'
  | 'ConcurrentTx';

/** OCPP 1.6-J StartTransaction response payload returned by central systems. */
export interface OcppStartTransactionResponse {
  readonly idTagInfo: {
    readonly status: OcppStartTransactionIdTagStatus;
  };
  readonly transactionId: number;
}

/** OCPP 1.6-J StopTransaction request payload. */
export interface OcppStopTransactionRequest {
  readonly idTag?: string;
  readonly meterStop: number;
  readonly reason?:
    | 'EmergencyStop'
    | 'EVDisconnected'
    | 'HardReset'
    | 'Local'
    | 'Other'
    | 'PowerLoss'
    | 'Reboot'
    | 'Remote'
    | 'SoftReset'
    | 'UnlockCommand'
    | 'DeAuthorized';
  readonly timestamp: string;
  readonly transactionId: number;
}

/** OCPP 1.6-J StopTransaction response payload returned by central systems. */
export interface OcppStopTransactionResponse {
  readonly idTagInfo?: {
    readonly status: OcppStartTransactionIdTagStatus;
  };
}

/** OCPP request payload for a central-system RemoteStartTransaction command. */
export interface OcppRemoteStartTransactionRequest {
  readonly connectorId: number;
  readonly idTag: string;
}

/** OCPP response status values returned for RemoteStartTransaction commands. */
export type OcppRemoteStartTransactionResponseStatus = 'Accepted' | 'Rejected';

/** OCPP response payload returned by a charge point for RemoteStartTransaction commands. */
export interface OcppRemoteStartTransactionResponse {
  readonly status: OcppRemoteStartTransactionResponseStatus;
}

/** OCPP request payload for a central-system RemoteStopTransaction command. */
export interface OcppRemoteStopTransactionRequest {
  readonly transactionId: number;
}

/** OCPP response status values returned for RemoteStopTransaction commands. */
export type OcppRemoteStopTransactionResponseStatus = 'Accepted' | 'Rejected';

/** OCPP response payload returned by a charge point for RemoteStopTransaction commands. */
export interface OcppRemoteStopTransactionResponse {
  readonly status: OcppRemoteStopTransactionResponseStatus;
}
