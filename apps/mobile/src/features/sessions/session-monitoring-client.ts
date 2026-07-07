import {
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorClientToServerEvents,
  type SessionMonitorRoomRequest,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import { io, type ManagerOptions, type SocketOptions } from 'socket.io-client';

import { getApiBaseUrl, resolveApiBaseUrl } from '../../config/runtime';
import { getPersistedAccessToken } from '../onboarding/session-storage';

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
  on(event: 'connect', listener: () => void): SessionMonitoringSocket;
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
  readonly getAccessToken?: () => string | null;
  readonly socketFactory?: SessionMonitoringSocketFactory;
}

/** Creates one typed session-monitoring client backed by Socket.IO websocket transport. */
export function createSessionMonitoringClient(
  input: CreateSessionMonitoringClientInput = {},
): SessionMonitoringClient {
  // Default to the configured API base URL (matching the REST clients) so real
  // devices reach the deployed gateway instead of localhost.
  const apiBaseUrl = resolveApiBaseUrl(input.apiBaseUrl ?? getApiBaseUrl());
  const getAccessToken = input.getAccessToken ?? getPersistedAccessToken;
  const socketFactory = input.socketFactory ?? createDefaultSessionMonitoringSocket;
  const socket = socketFactory(apiBaseUrl, {
    // Resolved lazily on every (re)connect so a refreshed token is picked up;
    // the monitoring gateway authenticates via handshake.auth.token.
    auth: (callback: (data: Record<string, unknown>) => void): void => {
      callback({ token: getAccessToken() ?? '' });
    },
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
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
  private readonly subscriberCountBySessionId = new Map<string, number>();

  constructor(private readonly socket: SessionMonitoringSocket) {
    // Socket.IO drops server-side room membership when the connection is lost, and the
    // 'connect' event fires again after every automatic reconnect. Re-join all active
    // session rooms so monitoring updates survive connection drops.
    this.socket.on('connect', (): void => {
      for (const sessionId of this.subscriberCountBySessionId.keys()) {
        this.socket.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, { sessionId });
      }
    });
  }

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
    this.trackSubscription(normalizedSessionId);
    this.connect();
    this.socket.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
      sessionId: normalizedSessionId,
    });

    let isDisposed = false;

    return (): void => {
      if (isDisposed) {
        return;
      }

      isDisposed = true;

      if (this.releaseSubscription(normalizedSessionId)) {
        this.socket.emit(SESSION_MONITOR_UNSUBSCRIBE_EVENT, {
          sessionId: normalizedSessionId,
        });
      }

      this.socket.off(SESSION_MONITOR_UPDATE_EVENT, handler);
    };
  }

  /** Registers one additional subscriber for a session room. */
  private trackSubscription(sessionId: string): void {
    const subscriberCount = this.subscriberCountBySessionId.get(sessionId) ?? 0;

    this.subscriberCountBySessionId.set(sessionId, subscriberCount + 1);
  }

  /** Releases one subscriber and reports whether the room has no subscribers left. */
  private releaseSubscription(sessionId: string): boolean {
    const subscriberCount = this.subscriberCountBySessionId.get(sessionId) ?? 0;

    if (subscriberCount <= 1) {
      this.subscriberCountBySessionId.delete(sessionId);

      return true;
    }

    this.subscriberCountBySessionId.set(sessionId, subscriberCount - 1);

    return false;
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
