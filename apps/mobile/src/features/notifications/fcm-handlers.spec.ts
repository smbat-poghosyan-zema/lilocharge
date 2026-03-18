import { PushNotificationEventType } from '@lilocharge/shared-types';

import {
  handleIncomingFcmMessage,
  parseFcmNotificationData,
  type FcmRemoteMessage,
} from './fcm-handlers';

describe('fcm handlers', () => {
  it('parses one valid session-completed FCM payload', () => {
    const payload = parseFcmNotificationData({
      eventType: PushNotificationEventType.SESSION_COMPLETED,
      sessionId: 'session-1',
      totalCostAmd: '4500',
      userId: 'user-1',
    });

    expect(payload).toEqual({
      eventType: PushNotificationEventType.SESSION_COMPLETED,
      sessionId: 'session-1',
      totalCostAmd: 4500,
      userId: 'user-1',
    });
  });

  it('returns null when FCM payload is missing required fields', () => {
    const payload = parseFcmNotificationData({
      eventType: PushNotificationEventType.SESSION_COMPLETED,
      sessionId: '',
      userId: 'user-1',
    });

    expect(payload).toBeNull();
  });

  it('routes one parsed payload to matching event callback', () => {
    const onPaymentFailed = jest.fn<
      void,
      [payload: { readonly sessionId: string; readonly userId: string }]
    >();
    const message: FcmRemoteMessage = {
      data: {
        eventType: PushNotificationEventType.PAYMENT_FAILED,
        failureReason: 'insufficient_funds',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    };

    handleIncomingFcmMessage(message, {
      onPaymentFailed,
    });

    expect(onPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PushNotificationEventType.PAYMENT_FAILED,
        failureReason: 'insufficient_funds',
        sessionId: 'session-1',
        userId: 'user-1',
      }),
    );
  });
});
