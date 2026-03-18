import {
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorClientToServerEvents,
  type SessionMonitorRoomRequest,
  type SessionMonitorServerToClientEvents,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

const SESSION_MONITORING_ROOM_PREFIX = 'session:';
const DEFAULT_SOCKET_CORS_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:19006',
];

type SessionMonitorSocket = Socket<
  SessionMonitorClientToServerEvents,
  SessionMonitorServerToClientEvents
>;

/** Socket.IO gateway that manages session-specific subscription rooms and live update broadcasts. */
@WebSocketGateway({
  cors: {
    credentials: true,
    origin: resolveSocketCorsOrigins(process.env.CORS_ORIGIN),
  },
  transports: ['websocket'],
})
export class SessionMonitoringGateway {
  private readonly logger: Logger = new Logger(SessionMonitoringGateway.name);

  @WebSocketServer()
  public server!: Server<SessionMonitorClientToServerEvents, SessionMonitorServerToClientEvents>;

  /** Subscribes one websocket client to one room for the requested session id. */
  @SubscribeMessage(SESSION_MONITOR_SUBSCRIBE_EVENT)
  public async handleSessionMonitorSubscribe(
    @ConnectedSocket() client: SessionMonitorSocket,
    @MessageBody() payload: SessionMonitorRoomRequest,
  ): Promise<void> {
    const sessionId = normalizeSessionId(payload.sessionId);
    if (sessionId === null) {
      return;
    }

    await client.join(resolveSessionRoomName(sessionId));
    this.logger.log(`Socket client subscribed to session monitor room: ${sessionId}`);
  }

  /** Unsubscribes one websocket client from one room for the requested session id. */
  @SubscribeMessage(SESSION_MONITOR_UNSUBSCRIBE_EVENT)
  public async handleSessionMonitorUnsubscribe(
    @ConnectedSocket() client: SessionMonitorSocket,
    @MessageBody() payload: SessionMonitorRoomRequest,
  ): Promise<void> {
    const sessionId = normalizeSessionId(payload.sessionId);
    if (sessionId === null) {
      return;
    }

    await client.leave(resolveSessionRoomName(sessionId));
    this.logger.log(`Socket client unsubscribed from session monitor room: ${sessionId}`);
  }

  /** Emits one live metrics update event to all websocket clients subscribed to the session room. */
  public emitSessionMonitorUpdate(payload: SessionMonitorUpdateEvent): void {
    this.server
      .to(resolveSessionRoomName(payload.sessionId))
      .emit(SESSION_MONITOR_UPDATE_EVENT, payload);
  }
}

/** Creates a deterministic socket room name for one session id. */
function resolveSessionRoomName(sessionId: string): string {
  return `${SESSION_MONITORING_ROOM_PREFIX}${sessionId}`;
}

/** Normalizes one session id from websocket payload and rejects blank values. */
function normalizeSessionId(rawSessionId: string): string | null {
  const normalizedSessionId = rawSessionId.trim();

  if (normalizedSessionId.length === 0) {
    return null;
  }

  return normalizedSessionId;
}

/** Parses socket CORS origin configuration from environment input with sensible defaults. */
function resolveSocketCorsOrigins(rawOrigins: string | undefined): true | string[] {
  if (rawOrigins === undefined) {
    return [...DEFAULT_SOCKET_CORS_ORIGINS];
  }

  const normalizedOrigins = rawOrigins.trim();
  if (normalizedOrigins.length === 0) {
    return [...DEFAULT_SOCKET_CORS_ORIGINS];
  }

  if (normalizedOrigins === '*') {
    return true;
  }

  const parsedOrigins = normalizedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return parsedOrigins.length > 0 ? parsedOrigins : [...DEFAULT_SOCKET_CORS_ORIGINS];
}
