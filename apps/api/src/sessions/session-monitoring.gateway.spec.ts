import {
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';

import { SessionMonitoringGateway } from './session-monitoring.gateway';

interface SessionSocketMock {
  readonly join: jest.Mock<Promise<void>, [string]>;
  readonly leave: jest.Mock<Promise<void>, [string]>;
}

interface SocketRoomEmitterMock {
  readonly emit: jest.Mock<void, [string, SessionMonitorUpdateEvent]>;
}

interface SocketServerMock {
  readonly to: jest.Mock<SocketRoomEmitterMock, [string]>;
}

/** Builds one valid real-time session metrics event fixture for websocket gateway tests. */
function buildSessionMonitorUpdateEvent(): SessionMonitorUpdateEvent {
  return {
    connectorId: '33333333-3333-3333-3333-333333333333',
    energyDeliveredKwh: 4.25,
    event: SESSION_MONITOR_UPDATE_EVENT,
    powerKw: 7.2,
    sessionId: '22222222-2222-2222-2222-222222222222',
    timestamp: '2026-02-17T13:05:00.000Z',
    totalCost: 1870,
    transactionId: '7701',
  };
}

describe('SessionMonitoringGateway', () => {
  let gateway: SessionMonitoringGateway;
  let roomEmitterMock: SocketRoomEmitterMock;
  let serverMock: SocketServerMock;
  let socketMock: SessionSocketMock;

  beforeEach(() => {
    roomEmitterMock = {
      emit: jest.fn<void, [string, SessionMonitorUpdateEvent]>(),
    };
    serverMock = {
      to: jest.fn<SocketRoomEmitterMock, [string]>().mockReturnValue(roomEmitterMock),
    };
    socketMock = {
      join: jest.fn<Promise<void>, [string]>().mockResolvedValue(),
      leave: jest.fn<Promise<void>, [string]>().mockResolvedValue(),
    };

    gateway = new SessionMonitoringGateway();
    gateway.server = serverMock as unknown as SessionMonitoringGateway['server'];
  });

  it('joins one session-scoped room for subscribe events', async () => {
    await gateway.handleSessionMonitorSubscribe(
      socketMock as unknown as Parameters<
        SessionMonitoringGateway['handleSessionMonitorSubscribe']
      >[0],
      {
        sessionId: 'session-1',
      },
    );

    expect(socketMock.join).toHaveBeenCalledWith('session:session-1');
  });

  it('leaves one session-scoped room for unsubscribe events', async () => {
    await gateway.handleSessionMonitorUnsubscribe(
      socketMock as unknown as Parameters<
        SessionMonitoringGateway['handleSessionMonitorUnsubscribe']
      >[0],
      {
        sessionId: 'session-1',
      },
    );

    expect(socketMock.leave).toHaveBeenCalledWith('session:session-1');
  });

  it('ignores blank session ids for subscribe and unsubscribe events', async () => {
    await gateway.handleSessionMonitorSubscribe(
      socketMock as unknown as Parameters<
        SessionMonitoringGateway['handleSessionMonitorSubscribe']
      >[0],
      {
        sessionId: '   ',
      },
    );
    await gateway.handleSessionMonitorUnsubscribe(
      socketMock as unknown as Parameters<
        SessionMonitoringGateway['handleSessionMonitorUnsubscribe']
      >[0],
      {
        sessionId: '',
      },
    );

    expect(socketMock.join).not.toHaveBeenCalled();
    expect(socketMock.leave).not.toHaveBeenCalled();
  });

  it('emits live session updates to the room matching the session id', () => {
    const update = buildSessionMonitorUpdateEvent();

    gateway.emitSessionMonitorUpdate(update);

    expect(serverMock.to).toHaveBeenCalledWith('session:22222222-2222-2222-2222-222222222222');
    expect(roomEmitterMock.emit).toHaveBeenCalledWith(SESSION_MONITOR_UPDATE_EVENT, update);
  });

  it('keeps shared event constants aligned with gateway handlers', () => {
    expect(SESSION_MONITOR_SUBSCRIBE_EVENT).toBe('session.monitor.subscribe');
    expect(SESSION_MONITOR_UNSUBSCRIBE_EVENT).toBe('session.monitor.unsubscribe');
  });
});
