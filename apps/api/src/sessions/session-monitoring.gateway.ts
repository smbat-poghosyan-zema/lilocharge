import {
  SESSION_MONITOR_ERROR_EVENT,
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorClientToServerEvents,
  type SessionMonitorRoomRequest,
  type SessionMonitorServerToClientEvents,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';

const SESSION_MONITORING_ROOM_PREFIX = 'session:';
const DEFAULT_SOCKET_CORS_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://localhost:19006',
];

/** Per-connection state stamped onto sockets after a successful handshake authentication. */
interface SessionMonitorSocketData {
  userId?: string;
}

/** JWT claims required on access tokens (mirrors the HTTP JwtAuthGuard contract). */
interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly tokenType: string;
}

type SessionMonitorSocket = Socket<
  SessionMonitorClientToServerEvents,
  SessionMonitorServerToClientEvents,
  DefaultEventsMap,
  SessionMonitorSocketData
>;

/**
 * Socket.IO gateway that manages session-specific subscription rooms and live update broadcasts.
 *
 * Connections must present a valid access token as `handshake.auth.token` (the socket.io auth
 * convention; the mobile client sends `auth: { token }`), validated with the same secret and
 * claims (`tokenType: 'access'`) as the HTTP JwtAuthGuard. Subscriptions are only granted for
 * sessions owned by the token's `sub`; everything else is rejected with a monitor error event.
 */
@WebSocketGateway({
  cors: {
    credentials: true,
    origin: resolveSocketCorsOrigins(process.env.CORS_ORIGIN),
  },
  transports: ['websocket'],
})
export class SessionMonitoringGateway implements OnGatewayConnection {
  private readonly logger: Logger = new Logger(SessionMonitoringGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prismaService: PrismaService,
  ) {}

  @WebSocketServer()
  public server!: Server<SessionMonitorClientToServerEvents, SessionMonitorServerToClientEvents>;

  /** Authenticates one incoming socket connection and stamps the resolved user id onto it. */
  public async handleConnection(client: SessionMonitorSocket): Promise<void> {
    const userId = await this.resolveAuthenticatedUserId(client);

    if (userId === null) {
      this.logger.warn('Socket connection rejected: missing or invalid access token');
      client.emit(SESSION_MONITOR_ERROR_EVENT, {
        event: SESSION_MONITOR_ERROR_EVENT,
        message: 'Unauthorized: a valid access token is required (handshake.auth.token)',
        sessionId: null,
      });
      client.disconnect(true);
      return;
    }

    client.data.userId = userId;
  }

  /** Subscribes one authenticated client to the room for one session it owns. */
  @SubscribeMessage(SESSION_MONITOR_SUBSCRIBE_EVENT)
  public async handleSessionMonitorSubscribe(
    @ConnectedSocket() client: SessionMonitorSocket,
    @MessageBody() payload: SessionMonitorRoomRequest,
  ): Promise<void> {
    const sessionId = normalizeSessionId(payload.sessionId);
    if (sessionId === null) {
      return;
    }

    const userId = client.data.userId;
    if (userId === undefined) {
      // Defense in depth: connections without stamped auth state must never join rooms.
      client.disconnect(true);
      return;
    }

    const ownedSession = await this.prismaService.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (ownedSession === null) {
      this.logger.warn(
        `Socket client subscription rejected: session ${sessionId} is not owned by the authenticated user`,
      );
      client.emit(SESSION_MONITOR_ERROR_EVENT, {
        event: SESSION_MONITOR_ERROR_EVENT,
        message: 'Subscription rejected: session not found for the authenticated user',
        sessionId,
      });
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

  /** Validates the handshake access token and returns its subject, or null when invalid. */
  private async resolveAuthenticatedUserId(client: SessionMonitorSocket): Promise<string | null> {
    const token = extractHandshakeToken(client);

    if (token === null) {
      return null;
    }

    try {
      const tokenPayload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.JWT_SECRET,
      });

      if (tokenPayload.tokenType !== 'access' || typeof tokenPayload.sub !== 'string') {
        return null;
      }

      return tokenPayload.sub;
    } catch {
      return null;
    }
  }
}

/** Extracts the access token from the socket.io handshake auth payload. */
function extractHandshakeToken(client: SessionMonitorSocket): string | null {
  const rawToken: unknown = client.handshake.auth?.['token'];

  if (typeof rawToken !== 'string') {
    return null;
  }

  const token = rawToken.trim();

  return token.length > 0 ? token : null;
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
