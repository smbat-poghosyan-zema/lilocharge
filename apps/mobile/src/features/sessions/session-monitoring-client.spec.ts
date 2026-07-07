import {
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';

import {
  createSessionMonitoringClient,
  type SessionMonitoringSocket,
  type SessionMonitoringSocketFactory,
} from './session-monitoring-client';

type SocketListener = ((payload: SessionMonitorUpdateEvent) => void) | (() => void);

interface SocketListenerMap {
  [event: string]: SocketListener | undefined;
}

interface SessionMonitoringSocketMock extends SessionMonitoringSocket {
  connected: boolean;
  readonly connect: jest.Mock<SessionMonitoringSocketMock, []>;
  readonly disconnect: jest.Mock<SessionMonitoringSocketMock, []>;
  readonly emit: jest.Mock<SessionMonitoringSocketMock, [string, unknown]>;
  readonly off: jest.Mock<
    SessionMonitoringSocketMock,
    [string, (payload: SessionMonitorUpdateEvent) => void]
  >;
  readonly on: jest.Mock<
    SessionMonitoringSocketMock,
    [string, (payload: SessionMonitorUpdateEvent) => void]
  >;
}

describe('session-monitoring-client', () => {
  let listenerByEvent: SocketListenerMap;
  let socketFactoryMock: jest.MockedFunction<SessionMonitoringSocketFactory>;
  let socketMock: SessionMonitoringSocketMock;

  beforeEach(() => {
    listenerByEvent = {};

    socketMock = {
      connected: false,
      connect: jest.fn<SessionMonitoringSocketMock, []>(),
      disconnect: jest.fn<SessionMonitoringSocketMock, []>(),
      emit: jest.fn<SessionMonitoringSocketMock, [string, unknown]>(),
      off: jest.fn<
        SessionMonitoringSocketMock,
        [string, (payload: SessionMonitorUpdateEvent) => void]
      >(),
      on: jest.fn<
        SessionMonitoringSocketMock,
        [string, (payload: SessionMonitorUpdateEvent) => void]
      >(),
    } as SessionMonitoringSocketMock;
    socketMock.connect.mockImplementation(() => {
      socketMock.connected = true;
      return socketMock;
    });
    socketMock.disconnect.mockImplementation(() => {
      socketMock.connected = false;
      return socketMock;
    });
    socketMock.on.mockImplementation(
      (
        event: string,
        listener: (payload: SessionMonitorUpdateEvent) => void,
      ): SessionMonitoringSocketMock => {
        listenerByEvent[event] = listener;
        return socketMock;
      },
    );
    socketMock.off.mockImplementation(
      (
        event: string,
        listener: (payload: SessionMonitorUpdateEvent) => void,
      ): SessionMonitoringSocketMock => {
        if (listenerByEvent[event] === listener) {
          listenerByEvent[event] = undefined;
        }
        return socketMock;
      },
    );
    socketMock.emit.mockReturnValue(socketMock);
    socketFactoryMock = jest
      .fn<SessionMonitoringSocket, Parameters<SessionMonitoringSocketFactory>>()
      .mockReturnValue(socketMock);
  });

  it('creates one socket connection with websocket transport, reconnection, and auth', () => {
    createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    expect(socketFactoryMock).toHaveBeenCalledWith('https://api.lilocharge.am', {
      auth: expect.any(Function) as unknown as (cb: (data: Record<string, unknown>) => void) => void,
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket'],
    });
  });

  it('subscribes to one session room and receives matching monitor update events', () => {
    const handleUpdate = jest.fn<void, [SessionMonitorUpdateEvent]>();
    const client = createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    const unsubscribe = client.subscribeToSession('session-1', handleUpdate);
    const listener = listenerByEvent[SESSION_MONITOR_UPDATE_EVENT] as
      | ((payload: SessionMonitorUpdateEvent) => void)
      | undefined;

    listener?.({
      connectorId: 'connector-1',
      energyDeliveredKwh: 5.2,
      event: SESSION_MONITOR_UPDATE_EVENT,
      powerKw: 6.1,
      sessionId: 'session-1',
      timestamp: '2026-02-17T12:40:00.000Z',
      totalCost: 2160,
      transactionId: '7701',
    });
    listener?.({
      connectorId: 'connector-2',
      energyDeliveredKwh: 5.4,
      event: SESSION_MONITOR_UPDATE_EVENT,
      powerKw: 6.2,
      sessionId: 'session-2',
      timestamp: '2026-02-17T12:41:00.000Z',
      totalCost: 2200,
      transactionId: '7702',
    });

    expect(socketMock.connect).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith(SESSION_MONITOR_SUBSCRIBE_EVENT, {
      sessionId: 'session-1',
    });
    expect(handleUpdate).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(socketMock.emit).toHaveBeenCalledWith(SESSION_MONITOR_UNSUBSCRIBE_EVENT, {
      sessionId: 'session-1',
    });
    expect(socketMock.off).toHaveBeenCalledWith(SESSION_MONITOR_UPDATE_EVENT, expect.any(Function));
  });

  it('exposes explicit connect and disconnect methods', () => {
    const client = createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    client.connect();
    client.disconnect();

    expect(socketMock.connect).toHaveBeenCalledTimes(1);
    expect(socketMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('resubscribes active session rooms when the socket reconnects', () => {
    const client = createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    client.subscribeToSession('session-1', jest.fn<void, [SessionMonitorUpdateEvent]>());
    socketMock.emit.mockClear();

    const connectListener = listenerByEvent.connect as (() => void) | undefined;
    connectListener?.();

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith(SESSION_MONITOR_SUBSCRIBE_EVENT, {
      sessionId: 'session-1',
    });
  });

  it('stops resubscribing session rooms after they are unsubscribed', () => {
    const client = createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    const unsubscribe = client.subscribeToSession(
      'session-1',
      jest.fn<void, [SessionMonitorUpdateEvent]>(),
    );

    unsubscribe();
    socketMock.emit.mockClear();

    const connectListener = listenerByEvent.connect as (() => void) | undefined;
    connectListener?.();

    expect(socketMock.emit).not.toHaveBeenCalled();
  });

  it('leaves the session room only when the last subscriber unsubscribes', () => {
    const client = createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    const unsubscribeFirst = client.subscribeToSession(
      'session-1',
      jest.fn<void, [SessionMonitorUpdateEvent]>(),
    );
    const unsubscribeSecond = client.subscribeToSession(
      'session-1',
      jest.fn<void, [SessionMonitorUpdateEvent]>(),
    );

    socketMock.emit.mockClear();
    unsubscribeFirst();
    unsubscribeFirst();

    expect(socketMock.emit).not.toHaveBeenCalledWith(SESSION_MONITOR_UNSUBSCRIBE_EVENT, {
      sessionId: 'session-1',
    });

    unsubscribeSecond();

    expect(socketMock.emit).toHaveBeenCalledWith(SESSION_MONITOR_UNSUBSCRIBE_EVENT, {
      sessionId: 'session-1',
    });
  });

  it('throws for blank session subscription requests', () => {
    const client = createSessionMonitoringClient({
      apiBaseUrl: 'https://api.lilocharge.am',
      socketFactory: socketFactoryMock,
    });

    expect(() =>
      client.subscribeToSession('   ', jest.fn<void, [SessionMonitorUpdateEvent]>()),
    ).toThrow('sessionId is required');
  });
});
