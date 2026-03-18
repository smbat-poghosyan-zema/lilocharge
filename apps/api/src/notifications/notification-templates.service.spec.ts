import { PushNotificationEventType } from '@lilocharge/shared-types';

import { NotificationTemplatesService } from './notification-templates.service';

describe('NotificationTemplatesService', () => {
  let service: NotificationTemplatesService;

  beforeEach(() => {
    service = new NotificationTemplatesService();
  });

  it('builds one Armenian session-start template', () => {
    const template = service.buildSessionStartedTemplate({
      language: 'hy',
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(template).toEqual({
      body: 'Սեսիա session-1-ը այժմ ակտիվ է։',
      data: {
        eventType: PushNotificationEventType.SESSION_STARTED,
        sessionId: 'session-1',
        userId: 'user-1',
      },
      title: 'Լիցքավորումը սկսվել է',
    });
  });

  it('builds one English session-completion template with cost metadata', () => {
    const template = service.buildSessionCompletedTemplate({
      language: 'en',
      sessionId: 'session-1',
      totalCostAmd: 3900,
      userId: 'user-1',
    });

    expect(template).toEqual({
      body: 'Session session-1 is complete. Total cost: 3900 AMD.',
      data: {
        eventType: PushNotificationEventType.SESSION_COMPLETED,
        sessionId: 'session-1',
        totalCostAmd: '3900',
        userId: 'user-1',
      },
      title: 'Charging session completed',
    });
  });

  it('builds one Russian payment-failed template with fallback guidance', () => {
    const template = service.buildPaymentFailedTemplate({
      failureReason: 'gateway_timeout',
      language: 'ru',
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(template).toEqual({
      body: 'Не удалось списать оплату по сессии session-1. Попробуйте другой способ оплаты.',
      data: {
        eventType: PushNotificationEventType.PAYMENT_FAILED,
        failureReason: 'gateway_timeout',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      title: 'Ошибка оплаты',
    });
  });
});
