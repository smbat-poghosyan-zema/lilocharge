/** Socket event used by clients to subscribe to one charging-session monitoring room. */
export const SESSION_MONITOR_SUBSCRIBE_EVENT = 'session.monitor.subscribe';

/** Socket event used by clients to unsubscribe from one charging-session monitoring room. */
export const SESSION_MONITOR_UNSUBSCRIBE_EVENT = 'session.monitor.unsubscribe';

/** Socket event emitted by the server when live session metrics change. */
export const SESSION_MONITOR_UPDATE_EVENT = 'session.monitor.updated';

/** Client payload used to subscribe/unsubscribe from one session monitoring room. */
export interface SessionMonitorRoomRequest {
  readonly sessionId: string;
}

/** Server payload emitted for one real-time charging session metrics refresh. */
export interface SessionMonitorUpdateEvent {
  readonly connectorId: string | null;
  readonly energyDeliveredKwh: number;
  readonly event: typeof SESSION_MONITOR_UPDATE_EVENT;
  readonly powerKw: number;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly totalCost: number;
  readonly transactionId: string | null;
}

/** Socket events emitted by server and consumed by mobile clients. */
export interface SessionMonitorServerToClientEvents {
  [SESSION_MONITOR_UPDATE_EVENT]: (payload: SessionMonitorUpdateEvent) => void;
}

/** Socket events emitted by mobile clients and consumed by server gateway handlers. */
export interface SessionMonitorClientToServerEvents {
  [SESSION_MONITOR_SUBSCRIBE_EVENT]: (payload: SessionMonitorRoomRequest) => void;
  [SESSION_MONITOR_UNSUBSCRIBE_EVENT]: (payload: SessionMonitorRoomRequest) => void;
}
