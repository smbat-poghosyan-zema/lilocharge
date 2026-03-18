import {
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorClientToServerEvents,
  type SessionMonitorRoomRequest,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client';

import { resolveApiBaseUrl } from '../../config/runtime';

/** WebSocket client contract used by mobile session-monitoring features. */
export interface SessionMonitoringClient {
  connect(): void;
  disconnect(): void;
  subscribeToSession(
    sessionId: string,
    onUpdate: (payload: SessionMonitorUpdateEvent) => void,
  ): () => void;
}

/** Narrow socket contract used by session-monitoring client wrappers and tests. */
export interface SessionMonitoringSocket {
  connected: boolean;
  connect(): SessionMonitoringSocket;
  disconnect(): SessionMonitoringSocket;
  emit(
    event: keyof SessionMonitorClientToServerEvents,
    payload: SessionMonitorRoomRequest,
  ): SessionMonitoringSocket;
  off(
    event: typeof SESSION_MONITOR_UPDATE_EVENT,
    listener: (payload: SessionMonitorUpdateEvent) => void,
  ): SessionMonitoringSocket;
  on(
    event: typeof SESSION_MONITOR_UPDATE_EVENT,
    listener: (payload: SessionMonitorUpdateEvent) => void,
  ): SessionMonitoringSocket;
}

/** Factory signature used to create one Socket.IO client for session monitoring. */
export type SessionMonitoringSocketFactory = (
  url: string,
  options: Partial<ManagerOptions & SocketOptions>,
) => SessionMonitoringSocket;

/** Input used to create one session-monitoring client instance. */
export interface CreateSessionMonitoringClientInput {
  readonly apiBaseUrl?: string;
  readonly socketFactory?: SessionMonitoringSocketFactory;
}

/** Creates one typed session-monitoring client backed by Socket.IO websocket transport. */
export function createSessionMonitoringClient(
  input: CreateSessionMonitoringClientInput = {},
): SessionMonitoringClient {
  const apiBaseUrl = resolveApiBaseUrl(input.apiBaseUrl);
  const socketFactory = input.socketFactory ?? createDefaultSessionMonitoringSocket;
  const socket = socketFactory(apiBaseUrl, {
    autoConnect: false,
    transports: ['websocket'],
  });

  return new SocketIoSessionMonitoringClient(socket);
}

/** Default Socket.IO factory used by runtime client creation. */
function createDefaultSessionMonitoringSocket(
  url: string,
  options: Partial<ManagerOptions & SocketOptions>,
): SessionMonitoringSocket {
  return io(url, options) as unknown as SessionMonitoringSocket;
}

/** Socket.IO implementation of one mobile session-monitoring websocket client. */
class SocketIoSessionMonitoringClient implements SessionMonitoringClient {
  constructor(private readonly socket: SessionMonitoringSocket) {}

  /** Opens the websocket connection if it is not already connected. */
  public connect(): void {
    if (this.socket.connected) {
      return;
    }

    this.socket.connect();
  }

  /** Closes the websocket connection. */
  public disconnect(): void {
    this.socket.disconnect();
  }

  /** Subscribes to one session room and returns one cleanup function that unsubscribes. */
  public subscribeToSession(
    sessionId: string,
    onUpdate: (payload: SessionMonitorUpdateEvent) => void,
  ): () => void {
    const normalizedSessionId = normalizeSessionId(sessionId);
    const handler = (payload: SessionMonitorUpdateEvent): void => {
      if (payload.sessionId !== normalizedSessionId) {
        return;
      }

      onUpdate(payload);
    };

    this.socket.on(SESSION_MONITOR_UPDATE_EVENT, handler);
    this.connect();
    this.socket.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
      sessionId: normalizedSessionId,
    });

    return (): void => {
      this.socket.emit(SESSION_MONITOR_UNSUBSCRIBE_EVENT, {
        sessionId: normalizedSessionId,
      });
      this.socket.off(SESSION_MONITOR_UPDATE_EVENT, handler);
    };
  }
}

/** Normalizes one session id and throws when the value is blank. */
function normalizeSessionId(sessionId: string): string {
  const normalizedSessionId = sessionId.trim();

  if (normalizedSessionId.length === 0) {
    throw new Error('sessionId is required');
  }

  return normalizedSessionId;
}
