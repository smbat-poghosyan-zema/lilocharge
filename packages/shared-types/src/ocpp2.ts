/**
 * OCPP 2.0.1 Type Definitions
 *
 * Types for OCPP 2.0.1 protocol messages between charge points and central system.
 * This is a subset implementation focused on core transaction and status management.
 */

/** OCPP 2.0.1 actions supported by the central system. */
export enum Ocpp2Action {
  AUTHORIZE = 'Authorize',
  BOOT_NOTIFICATION = 'BootNotification',
  HEARTBEAT = 'Heartbeat',
  STATUS_NOTIFICATION = 'StatusNotification',
  TRANSACTION_EVENT = 'TransactionEvent',
  METER_VALUES = 'MeterValues',
  REQUEST_START_TRANSACTION = 'RequestStartTransaction',
  REQUEST_STOP_TRANSACTION = 'RequestStopTransaction',
}

/** OCPP 2.0.1 registration status values. */
export type Ocpp2RegistrationStatus = 'Accepted' | 'Pending' | 'Rejected';

/** OCPP 2.0.1 connector status values. */
export type Ocpp2ConnectorStatus =
  | 'Available'
  | 'Occupied'
  | 'Reserved'
  | 'Unavailable'
  | 'Faulted';

/** OCPP 2.0.1 charging state values. */
export type Ocpp2ChargingState =
  | 'Charging'
  | 'EVConnected'
  | 'SuspendedEV'
  | 'SuspendedEVSE'
  | 'Idle';

/** OCPP 2.0.1 transaction event types. */
export type Ocpp2TransactionEventType = 'Started' | 'Updated' | 'Ended';

/** OCPP 2.0.1 trigger reason for transaction events. */
export type Ocpp2TriggerReason =
  | 'Authorized'
  | 'CablePluggedIn'
  | 'ChargingRateChanged'
  | 'ChargingStateChanged'
  | 'Deauthorized'
  | 'EnergyLimitReached'
  | 'EVCommunicationLost'
  | 'EVConnectTimeout'
  | 'MeterValueClock'
  | 'MeterValuePeriodic'
  | 'TimeLimitReached'
  | 'Trigger'
  | 'UnlockCommand'
  | 'StopAuthorized'
  | 'EVDeparted'
  | 'EVDetected'
  | 'RemoteStop'
  | 'RemoteStart';

/** OCPP 2.0.1 authorization status values. */
export type Ocpp2AuthorizationStatus =
  | 'Accepted'
  | 'Blocked'
  | 'ConcurrentTx'
  | 'Expired'
  | 'Invalid'
  | 'NoCredit'
  | 'NotAllowedTypeEVSE'
  | 'NotAtThisLocation'
  | 'NotAtThisTime'
  | 'Unknown';

/** OCPP 2.0.1 BootNotification reason. */
export type Ocpp2BootReason =
  | 'ApplicationReset'
  | 'FirmwareUpdate'
  | 'LocalReset'
  | 'PowerUp'
  | 'RemoteReset'
  | 'ScheduledReset'
  | 'Triggered'
  | 'Unknown'
  | 'Watchdog';

/** OCPP 2.0.1 ChargingStation component. */
export interface Ocpp2ChargingStation {
  readonly model: string;
  readonly vendorName: string;
  readonly serialNumber?: string;
  readonly modem?: {
    readonly iccid?: string;
    readonly imsi?: string;
  };
  readonly firmwareVersion?: string;
}

/** OCPP 2.0.1 BootNotification request payload. */
export interface Ocpp2BootNotificationRequest {
  readonly reason: Ocpp2BootReason;
  readonly chargingStation: Ocpp2ChargingStation;
}

/** OCPP 2.0.1 BootNotification response payload. */
export interface Ocpp2BootNotificationResponse {
  readonly currentTime: string;
  readonly interval: number;
  readonly status: Ocpp2RegistrationStatus;
  readonly statusInfo?: {
    readonly reasonCode?: string;
    readonly additionalInfo?: string;
  };
}

/** OCPP 2.0.1 Heartbeat response payload. */
export interface Ocpp2HeartbeatResponse {
  readonly currentTime: string;
}

/** OCPP 2.0.1 EVSE identifier. */
export interface Ocpp2EVSE {
  readonly id: number;
  readonly connectorId?: number;
}

/** OCPP 2.0.1 StatusNotification request payload. */
export interface Ocpp2StatusNotificationRequest {
  readonly timestamp: string;
  readonly connectorStatus: Ocpp2ConnectorStatus;
  readonly evseId: number;
  readonly connectorId: number;
}

/** OCPP 2.0.1 StatusNotification response payload (empty). */
export type Ocpp2StatusNotificationResponse = Record<string, never>;

/** OCPP 2.0.1 IdToken for authorization. */
export interface Ocpp2IdToken {
  readonly idToken: string;
  readonly type:
    | 'Central'
    | 'eMAID'
    | 'ISO14443'
    | 'ISO15693'
    | 'KeyCode'
    | 'Local'
    | 'MacAddress'
    | 'NoAuthorization';
}

/** OCPP 2.0.1 Authorize request payload. */
export interface Ocpp2AuthorizeRequest {
  readonly idToken: Ocpp2IdToken;
}

/** OCPP 2.0.1 Authorize response payload. */
export interface Ocpp2AuthorizeResponse {
  readonly idTokenInfo: Ocpp2IdTokenInfo;
}

/** OCPP 2.0.1 Transaction data. */
export interface Ocpp2Transaction {
  readonly transactionId: string;
  readonly chargingState?: Ocpp2ChargingState;
  readonly timeSpentCharging?: number;
  readonly stoppedReason?: string;
  readonly remoteStartId?: number;
}

/** OCPP 2.0.1 MeterValue sampled value. */
export interface Ocpp2SampledValue {
  readonly value: number;
  readonly context?:
    | 'Interruption.Begin'
    | 'Interruption.End'
    | 'Sample.Clock'
    | 'Sample.Periodic'
    | 'Transaction.Begin'
    | 'Transaction.End'
    | 'Trigger'
    | 'Other';
  readonly measurand?:
    | 'Current.Export'
    | 'Current.Import'
    | 'Current.Offered'
    | 'Energy.Active.Export.Register'
    | 'Energy.Active.Import.Register'
    | 'Energy.Reactive.Export.Register'
    | 'Energy.Reactive.Import.Register'
    | 'Energy.Active.Export.Interval'
    | 'Energy.Active.Import.Interval'
    | 'Energy.Reactive.Export.Interval'
    | 'Energy.Reactive.Import.Interval'
    | 'Frequency'
    | 'Power.Active.Export'
    | 'Power.Active.Import'
    | 'Power.Factor'
    | 'Power.Offered'
    | 'Power.Reactive.Export'
    | 'Power.Reactive.Import'
    | 'SoC'
    | 'Voltage';
  readonly phase?:
    | 'L1'
    | 'L2'
    | 'L3'
    | 'N'
    | 'L1-N'
    | 'L2-N'
    | 'L3-N'
    | 'L1-L2'
    | 'L2-L3'
    | 'L3-L1';
  readonly location?: 'Body' | 'Cable' | 'EV' | 'Inlet' | 'Outlet';
  readonly unitOfMeasure?: {
    readonly unit?:
      | 'Wh'
      | 'kWh'
      | 'varh'
      | 'kvarh'
      | 'W'
      | 'kW'
      | 'VA'
      | 'kVA'
      | 'var'
      | 'kvar'
      | 'A'
      | 'V'
      | 'Celsius'
      | 'Fahrenheit'
      | 'K'
      | 'Percent';
    readonly multiplier?: number;
  };
}

/** OCPP 2.0.1 MeterValue reading. */
export interface Ocpp2MeterValue {
  readonly timestamp: string;
  readonly sampledValue: readonly Ocpp2SampledValue[];
}

/** OCPP 2.0.1 TransactionEvent request payload. */
export interface Ocpp2TransactionEventRequest {
  readonly eventType: Ocpp2TransactionEventType;
  readonly timestamp: string;
  readonly triggerReason: Ocpp2TriggerReason;
  readonly seqNo: number;
  readonly transactionInfo: Ocpp2Transaction;
  readonly meterValue?: readonly Ocpp2MeterValue[];
  readonly idToken?: Ocpp2IdToken;
  readonly evse?: Ocpp2EVSE;
  readonly offline?: boolean;
  readonly numberOfPhasesUsed?: number;
  readonly cableMaxCurrent?: number;
  readonly reservationId?: number;
}

/** OCPP 2.0.1 IdTokenInfo for authorization responses. */
export interface Ocpp2IdTokenInfo {
  readonly status: Ocpp2AuthorizationStatus;
  readonly cacheExpiryDateTime?: string;
  readonly chargingPriority?: number;
  readonly language1?: string;
  readonly language2?: string;
  readonly groupIdToken?: Ocpp2IdToken;
  readonly personalMessage?: {
    readonly format: 'ASCII' | 'HTML' | 'URI' | 'UTF8';
    readonly content: string;
    readonly language?: string;
  };
}

/** OCPP 2.0.1 TransactionEvent response payload. */
export interface Ocpp2TransactionEventResponse {
  readonly totalCost?: number;
  readonly chargingPriority?: number;
  readonly idTokenInfo?: Ocpp2IdTokenInfo;
  readonly updatedPersonalMessage?: {
    readonly format: 'ASCII' | 'HTML' | 'URI' | 'UTF8';
    readonly content: string;
    readonly language?: string;
  };
}

/** OCPP 2.0.1 MeterValues request payload. */
export interface Ocpp2MeterValuesRequest {
  readonly evseId: number;
  readonly meterValue: readonly Ocpp2MeterValue[];
}

/** OCPP 2.0.1 MeterValues response payload (empty). */
export type Ocpp2MeterValuesResponse = Record<string, never>;

/** OCPP 2.0.1 RequestStartTransaction request payload. */
export interface Ocpp2RequestStartTransactionRequest {
  readonly idToken: Ocpp2IdToken;
  readonly remoteStartId: number;
  readonly evseId?: number;
  readonly groupIdToken?: Ocpp2IdToken;
  readonly chargingProfile?: unknown; // Simplified for now
}

/** OCPP 2.0.1 RequestStartTransaction status. */
export type Ocpp2RequestStartStopStatus = 'Accepted' | 'Rejected';

/** OCPP 2.0.1 RequestStartTransaction response payload. */
export interface Ocpp2RequestStartTransactionResponse {
  readonly status: Ocpp2RequestStartStopStatus;
  readonly statusInfo?: {
    readonly reasonCode?: string;
    readonly additionalInfo?: string;
  };
}

/** OCPP 2.0.1 RequestStopTransaction request payload. */
export interface Ocpp2RequestStopTransactionRequest {
  readonly transactionId: string;
}

/** OCPP 2.0.1 RequestStopTransaction response payload. */
export interface Ocpp2RequestStopTransactionResponse {
  readonly status: Ocpp2RequestStartStopStatus;
  readonly statusInfo?: {
    readonly reasonCode?: string;
    readonly additionalInfo?: string;
  };
}
