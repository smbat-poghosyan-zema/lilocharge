import { PushNotificationEventType, PushNotificationPlatform } from '@lilocharge/shared-types';

import type { NotificationsApi } from './notifications-api';
import {
  initializeFcmRuntime,
  type FcmMessagingAdapter,
  type FcmRemoteMessage,
} from './fcm-runtime';

interface NotificationsApiMock extends Pick<
  NotificationsApi,
  'registerPushToken' | 'unregisterPushToken'
> {
  readonly registerPushToken: jest.Mock<
    ReturnType<NotificationsApi['registerPushToken']>,
    Parameters<NotificationsApi['registerPushToken']>
  >;
  readonly unregisterPushToken: jest.Mock<
    ReturnType<NotificationsApi['unregisterPushToken']>,
    Parameters<NotificationsApi['unregisterPushToken']>
  >;
}

describe('initializeFcmRuntime', () => {
  it('skips token registration when permission is denied', async () => {
    const adapterMock = createMessagingAdapterMock({
      requestPermission: jest.fn<Promise<boolean>, []>().mockResolvedValue(false),
    });
    const notificationsApiMock: NotificationsApiMock = {
      registerPushToken: jest
        .fn<
          ReturnType<NotificationsApi['registerPushToken']>,
          Parameters<NotificationsApi['registerPushToken']>
        >()
        .mockResolvedValue(),
      unregisterPushToken: jest
        .fn<
          ReturnType<NotificationsApi['unregisterPushToken']>,
          Parameters<NotificationsApi['unregisterPushToken']>
        >()
        .mockResolvedValue(),
    };

    const dispose = await initializeFcmRuntime({
      adapter: adapterMock,
      notificationsApi: notificationsApiMock,
      platform: PushNotificationPlatform.ANDROID,
      userId: 'user-1',
    });

    expect(notificationsApiMock.registerPushToken).not.toHaveBeenCalled();
    dispose();
  });

  it('registers token, handles token refresh, and dispatches foreground messages', async () => {
    let foregroundListener: ((message: FcmRemoteMessage) => void) | null = null;
    let openedAppListener: ((message: FcmRemoteMessage) => void) | null = null;
    let refreshListener: ((token: string) => void) | null = null;

    const unsubscribeForeground = jest.fn<void, []>();
    const unsubscribeOpenedApp = jest.fn<void, []>();
    const unsubscribeRefresh = jest.fn<void, []>();
    const adapterMock = createMessagingAdapterMock({
      getInitialNotification: jest.fn<Promise<FcmRemoteMessage | null>, []>().mockResolvedValue({
        data: {
          eventType: PushNotificationEventType.PAYMENT_SUCCEEDED,
          paymentAmountAmd: '2100',
          sessionId: 'session-initial',
          userId: 'user-1',
        },
      }),
      getToken: jest.fn<Promise<string>, []>().mockResolvedValue('token-1'),
      onMessage: jest
        .fn<() => void, [(message: FcmRemoteMessage) => void]>()
        .mockImplementation((listener: (message: FcmRemoteMessage) => void) => {
          foregroundListener = listener;
          return unsubscribeForeground;
        }),
      onNotificationOpenedApp: jest
        .fn<() => void, [(message: FcmRemoteMessage) => void]>()
        .mockImplementation((listener: (message: FcmRemoteMessage) => void) => {
          openedAppListener = listener;
          return unsubscribeOpenedApp;
        }),
      onTokenRefresh: jest
        .fn<() => void, [(token: string) => void]>()
        .mockImplementation((listener: (token: string) => void) => {
          refreshListener = listener;
          return unsubscribeRefresh;
        }),
      requestPermission: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    });
    const notificationsApiMock: NotificationsApiMock = {
      registerPushToken: jest
        .fn<
          ReturnType<NotificationsApi['registerPushToken']>,
          Parameters<NotificationsApi['registerPushToken']>
        >()
        .mockResolvedValue(),
      unregisterPushToken: jest
        .fn<
          ReturnType<NotificationsApi['unregisterPushToken']>,
          Parameters<NotificationsApi['unregisterPushToken']>
        >()
        .mockResolvedValue(),
    };
    const onPaymentSucceeded = jest.fn();

    const dispose = await initializeFcmRuntime({
      adapter: adapterMock,
      notificationsApi: notificationsApiMock,
      onPaymentSucceeded,
      platform: PushNotificationPlatform.ANDROID,
      userId: 'user-1',
    });

    if (refreshListener === null || foregroundListener === null || openedAppListener === null) {
      throw new Error('Expected FCM listeners to be registered');
    }

    (refreshListener as (token: string) => void)('token-2');
    (foregroundListener as (message: FcmRemoteMessage) => void)({
      data: {
        eventType: PushNotificationEventType.SESSION_STARTED,
        sessionId: 'session-foreground',
        userId: 'user-1',
      },
    });
    (openedAppListener as (message: FcmRemoteMessage) => void)({
      data: {
        eventType: PushNotificationEventType.PAYMENT_SUCCEEDED,
        paymentAmountAmd: '3500',
        sessionId: 'session-opened',
        userId: 'user-1',
      },
    });

    expect(notificationsApiMock.registerPushToken).toHaveBeenNthCalledWith(1, 'user-1', {
      platform: PushNotificationPlatform.ANDROID,
      token: 'token-1',
    });
    expect(notificationsApiMock.registerPushToken).toHaveBeenNthCalledWith(2, 'user-1', {
      platform: PushNotificationPlatform.ANDROID,
      token: 'token-2',
    });
    expect(onPaymentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PushNotificationEventType.PAYMENT_SUCCEEDED,
      }),
    );

    dispose();

    expect(unsubscribeForeground).toHaveBeenCalledTimes(1);
    expect(unsubscribeOpenedApp).toHaveBeenCalledTimes(1);
    expect(unsubscribeRefresh).toHaveBeenCalledTimes(1);
  });
});

/**
 * Creates one typed messaging-adapter mock with default successful permission/token behavior.
 */
function createMessagingAdapterMock(
  overrides?: Partial<jest.Mocked<FcmMessagingAdapter>>,
): jest.Mocked<FcmMessagingAdapter> {
  return {
    getInitialNotification: jest.fn<Promise<FcmRemoteMessage | null>, []>().mockResolvedValue(null),
    getToken: jest.fn<Promise<string>, []>().mockResolvedValue('token-default'),
    onMessage: jest
      .fn<() => void, [(message: FcmRemoteMessage) => void]>()
      .mockReturnValue((): void => {
        return;
      }),
    onNotificationOpenedApp: jest
      .fn<() => void, [(message: FcmRemoteMessage) => void]>()
      .mockReturnValue((): void => {
        return;
      }),
    onTokenRefresh: jest.fn<() => void, [(token: string) => void]>().mockReturnValue((): void => {
      return;
    }),
    requestPermission: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    ...overrides,
  };
}
