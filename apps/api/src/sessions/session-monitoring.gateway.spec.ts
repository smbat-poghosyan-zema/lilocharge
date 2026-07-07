import {
  SESSION_MONITOR_ERROR_EVENT,
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import type { JwtService } from '@nestjs/jwt';

import type { PrismaService } from '../prisma/prisma.service';
import { SessionMonitoringGateway } from './session-monitoring.gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';

interface SessionSocketMock {
  readonly data: { userId?: string };
  readonly disconnect: jest.Mock<void, [boolean?]>;
  readonly emit: jest.Mock<void, [string, unknown]>;
  readonly handshake: { auth: Record<string, unknown> };
  readonly join: jest.Mock<Promise<void>, [string]>;
  readonly leave: jest.Mock<Promise<void>, [string]>;
}

interface SocketRoomEmitterMock {
  readonly emit: jest.Mock<void, [string, SessionMonitorUpdateEvent]>;
}

interface SocketServerMock {
  readonly to: jest.Mock<SocketRoomEmitterMock, [string]>;
}

interface JwtServiceMock {
  readonly verifyAsync: jest.Mock<Promise<unknown>, [string, unknown?]>;
}

interface PrismaServiceMock {
  readonly session: {
    readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
  };
}

type GatewaySocket = Parameters<SessionMonitoringGateway['handleConnection']>[0];

/** Builds one valid real-time session metrics event fixture for websocket gateway tests. */
function buildSessionMonitorUpdateEvent(): SessionMonitorUpdateEvent {
  return {
    connectorId: '33333333-3333-3333-3333-333333333333',
    energyDeliveredKwh: 4.25,
    event: SESSION_MONITOR_UPDATE_EVENT,
    powerKw: 7.2,
    sessionId: SESSION_ID,
    timestamp: '2026-02-17T13:05:00.000Z',
    totalCost: 1870,
    transactionId: '7701',
  };
}

/** Builds one socket mock with configurable handshake auth and stamped socket data. */
function buildSocketMock(auth: Record<string, unknown>, userId?: string): SessionSocketMock {
  return {
    data: userId === undefined ? {} : { userId },
    disconnect: jest.fn<void, [boolean?]>(),
    emit: jest.fn<void, [string, unknown]>(),
    handshake: { auth },
    join: jest.fn<Promise<void>, [string]>().mockResolvedValue(),
    leave: jest.fn<Promise<void>, [string]>().mockResolvedValue(),
  };
}

describe('SessionMonitoringGateway', () => {
  let gateway: SessionMonitoringGateway;
  let jwtServiceMock: JwtServiceMock;
  let prismaMock: PrismaServiceMock;
  let roomEmitterMock: SocketRoomEmitterMock;
  let serverMock: SocketServerMock;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    jwtServiceMock = {
      verifyAsync: jest.fn<Promise<unknown>, [string, unknown?]>().mockResolvedValue({
        email: 'user@lilocharge.am',
        sub: USER_ID,
        tokenType: 'access',
      }),
    };
    prismaMock = {
      session: {
        findFirst: jest
          .fn<Promise<{ readonly id: string } | null>, [unknown]>()
          .mockResolvedValue({ id: SESSION_ID }),
      },
    };
    roomEmitterMock = {
      emit: jest.fn<void, [string, SessionMonitorUpdateEvent]>(),
    };
    serverMock = {
      to: jest.fn<SocketRoomEmitterMock, [string]>().mockReturnValue(roomEmitterMock),
    };

    gateway = new SessionMonitoringGateway(
      jwtServiceMock as unknown as JwtService,
      prismaMock as unknown as PrismaService,
    );
    gateway.server = serverMock as unknown as SessionMonitoringGateway['server'];
  });

  describe('connection authentication (handshake.auth.token)', () => {
    it('accepts connections carrying a valid access token and stamps the user id', async () => {
      const socket = buildSocketMock({ token: 'valid-token' });

      await gateway.handleConnection(socket as unknown as GatewaySocket);

      expect(jwtServiceMock.verifyAsync).toHaveBeenCalledWith('valid-token', {
        secret: process.env.JWT_SECRET,
      });
      expect(socket.data.userId).toBe(USER_ID);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('rejects and disconnects connections without a token', async () => {
      const socket = buildSocketMock({});

      await gateway.handleConnection(socket as unknown as GatewaySocket);

      expect(socket.emit).toHaveBeenCalledWith(
        SESSION_MONITOR_ERROR_EVENT,
        expect.objectContaining({ event: SESSION_MONITOR_ERROR_EVENT, sessionId: null }),
      );
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.data.userId).toBeUndefined();
    });

    it('rejects invalid or expired tokens', async () => {
      jwtServiceMock.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      const socket = buildSocketMock({ token: 'expired-token' });

      await gateway.handleConnection(socket as unknown as GatewaySocket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects tokens whose tokenType is not access (refresh tokens must not connect)', async () => {
      jwtServiceMock.verifyAsync.mockResolvedValue({
        jti: 'refresh-1',
        sub: USER_ID,
        tokenType: 'refresh',
      });
      const socket = buildSocketMock({ token: 'refresh-token' });

      await gateway.handleConnection(socket as unknown as GatewaySocket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('ownership-checked subscriptions', () => {
    it('joins one session-scoped room when the session belongs to the authenticated user', async () => {
      const socket = buildSocketMock({ token: 'valid-token' }, USER_ID);

      await gateway.handleSessionMonitorSubscribe(
        socket as unknown as Parameters<SessionMonitoringGateway['handleSessionMonitorSubscribe']>[0],
        { sessionId: SESSION_ID },
      );

      expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
        where: {
          id: SESSION_ID,
          userId: USER_ID,
        },
        select: { id: true },
      });
      expect(socket.join).toHaveBeenCalledWith(`session:${SESSION_ID}`);
    });

    it('rejects subscriptions to sessions owned by other users with a monitor error event', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);
      const socket = buildSocketMock({ token: 'valid-token' }, USER_ID);

      await gateway.handleSessionMonitorSubscribe(
        socket as unknown as Parameters<SessionMonitoringGateway['handleSessionMonitorSubscribe']>[0],
        { sessionId: SESSION_ID },
      );

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        SESSION_MONITOR_ERROR_EVENT,
        expect.objectContaining({ sessionId: SESSION_ID }),
      );
    });

    it('disconnects subscribe attempts from sockets without stamped auth state', async () => {
      const socket = buildSocketMock({ token: 'valid-token' });

      await gateway.handleSessionMonitorSubscribe(
        socket as unknown as Parameters<SessionMonitoringGateway['handleSessionMonitorSubscribe']>[0],
        { sessionId: SESSION_ID },
      );

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('leaves one session-scoped room for unsubscribe events', async () => {
      const socket = buildSocketMock({ token: 'valid-token' }, USER_ID);

      await gateway.handleSessionMonitorUnsubscribe(
        socket as unknown as Parameters<
          SessionMonitoringGateway['handleSessionMonitorUnsubscribe']
        >[0],
        { sessionId: 'session-1' },
      );

      expect(socket.leave).toHaveBeenCalledWith('session:session-1');
    });

    it('ignores blank session ids for subscribe and unsubscribe events', async () => {
      const socket = buildSocketMock({ token: 'valid-token' }, USER_ID);

      await gateway.handleSessionMonitorSubscribe(
        socket as unknown as Parameters<SessionMonitoringGateway['handleSessionMonitorSubscribe']>[0],
        { sessionId: '   ' },
      );
      await gateway.handleSessionMonitorUnsubscribe(
        socket as unknown as Parameters<
          SessionMonitoringGateway['handleSessionMonitorUnsubscribe']
        >[0],
        { sessionId: '' },
      );

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  it('emits live session updates to the room matching the session id', () => {
    const update = buildSessionMonitorUpdateEvent();

    gateway.emitSessionMonitorUpdate(update);

    expect(serverMock.to).toHaveBeenCalledWith(`session:${SESSION_ID}`);
    expect(roomEmitterMock.emit).toHaveBeenCalledWith(SESSION_MONITOR_UPDATE_EVENT, update);
  });

  it('keeps shared event constants aligned with gateway handlers', () => {
    expect(SESSION_MONITOR_SUBSCRIBE_EVENT).toBe('session.monitor.subscribe');
    expect(SESSION_MONITOR_UNSUBSCRIBE_EVENT).toBe('session.monitor.unsubscribe');
    expect(SESSION_MONITOR_ERROR_EVENT).toBe('session.monitor.error');
  });
});
