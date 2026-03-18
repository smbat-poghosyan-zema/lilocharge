import { PushNotificationPlatform } from '@lilocharge/shared-types';
import type { Language } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import type { FcmAdminClient } from './fcm-admin.client';
import type { NotificationTemplatesService } from './notification-templates.service';
import { NotificationsService } from './notifications.service';

interface UserExistenceRecord {
  readonly id: string;
}

interface UserNotificationLookupRecord {
  readonly id: string;
  readonly language: Language;
  readonly pushNotificationsEnabled: boolean;
  readonly pushTokens: readonly {
    readonly id: string;
    readonly token: string;
  }[];
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<
    Promise<UserExistenceRecord | UserNotificationLookupRecord | null>,
    [unknown]
  >;
}

interface PrismaUserPushTokenDelegateMock {
  readonly updateMany: jest.Mock<Promise<{ readonly count: number }>, [unknown]>;
  readonly upsert: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
}

interface PrismaServiceMock {
  readonly user: PrismaUserDelegateMock;
  readonly userPushToken: PrismaUserPushTokenDelegateMock;
}

interface NotificationTemplatesServiceMock extends Pick<
  NotificationTemplatesService,
  | 'buildPaymentFailedTemplate'
  | 'buildPaymentSucceededTemplate'
  | 'buildSessionCompletedTemplate'
  | 'buildSessionStartedTemplate'
> {
  readonly buildPaymentFailedTemplate: jest.Mock<
    ReturnType<NotificationTemplatesService['buildPaymentFailedTemplate']>,
    Parameters<NotificationTemplatesService['buildPaymentFailedTemplate']>
  >;
  readonly buildPaymentSucceededTemplate: jest.Mock<
    ReturnType<NotificationTemplatesService['buildPaymentSucceededTemplate']>,
    Parameters<NotificationTemplatesService['buildPaymentSucceededTemplate']>
  >;
  readonly buildSessionCompletedTemplate: jest.Mock<
    ReturnType<NotificationTemplatesService['buildSessionCompletedTemplate']>,
    Parameters<NotificationTemplatesService['buildSessionCompletedTemplate']>
  >;
  readonly buildSessionStartedTemplate: jest.Mock<
    ReturnType<NotificationTemplatesService['buildSessionStartedTemplate']>,
    Parameters<NotificationTemplatesService['buildSessionStartedTemplate']>
  >;
}

interface FcmAdminClientMock extends Pick<FcmAdminClient, 'sendMulticast'> {
  readonly sendMulticast: jest.Mock<
    ReturnType<FcmAdminClient['sendMulticast']>,
    Parameters<FcmAdminClient['sendMulticast']>
  >;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('NotificationsService', () => {
  let fcmAdminClientMock: FcmAdminClientMock;
  let prismaMock: PrismaServiceMock;
  let service: NotificationsService;
  let templatesServiceMock: NotificationTemplatesServiceMock;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn<
          Promise<UserExistenceRecord | UserNotificationLookupRecord | null>,
          [unknown]
        >(),
      },
      userPushToken: {
        updateMany: jest
          .fn<Promise<{ readonly count: number }>, [unknown]>()
          .mockResolvedValue({ count: 1 }),
        upsert: jest
          .fn<Promise<{ readonly id: string }>, [unknown]>()
          .mockResolvedValue({ id: 'push-token-1' }),
      },
    };
    templatesServiceMock = {
      buildPaymentFailedTemplate: jest.fn<
        ReturnType<NotificationTemplatesService['buildPaymentFailedTemplate']>,
        Parameters<NotificationTemplatesService['buildPaymentFailedTemplate']>
      >(),
      buildPaymentSucceededTemplate: jest.fn<
        ReturnType<NotificationTemplatesService['buildPaymentSucceededTemplate']>,
        Parameters<NotificationTemplatesService['buildPaymentSucceededTemplate']>
      >(),
      buildSessionCompletedTemplate: jest.fn<
        ReturnType<NotificationTemplatesService['buildSessionCompletedTemplate']>,
        Parameters<NotificationTemplatesService['buildSessionCompletedTemplate']>
      >(),
      buildSessionStartedTemplate: jest.fn<
        ReturnType<NotificationTemplatesService['buildSessionStartedTemplate']>,
        Parameters<NotificationTemplatesService['buildSessionStartedTemplate']>
      >(),
    };
    fcmAdminClientMock = {
      sendMulticast: jest
        .fn<
          ReturnType<FcmAdminClient['sendMulticast']>,
          Parameters<FcmAdminClient['sendMulticast']>
        >()
        .mockResolvedValue({
          failureCount: 0,
          invalidTokens: [],
          successCount: 1,
        }),
    };

    service = new NotificationsService(
      prismaMock as unknown as PrismaService,
      templatesServiceMock as unknown as NotificationTemplatesService,
      fcmAdminClientMock as unknown as FcmAdminClient,
    );
  });

  it('upserts one user push token with normalized token text', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });

    await service.registerPushToken(USER_ID, {
      platform: PushNotificationPlatform.ANDROID,
      token: '  fcm-token-1  ',
    });

    expect(prismaMock.userPushToken.upsert).toHaveBeenCalledWith({
      create: {
        isActive: true,
        platform: PushNotificationPlatform.ANDROID,
        token: 'fcm-token-1',
        userId: USER_ID,
      },
      update: {
        isActive: true,
        platform: PushNotificationPlatform.ANDROID,
        token: 'fcm-token-1',
        userId: USER_ID,
      },
      where: {
        token: 'fcm-token-1',
      },
    });
  });

  it('deactivates one user push token during unregister requests', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });

    await service.unregisterPushToken(USER_ID, {
      token: 'fcm-token-1',
    });

    expect(prismaMock.userPushToken.updateMany).toHaveBeenCalledWith({
      data: {
        isActive: false,
      },
      where: {
        token: 'fcm-token-1',
        userId: USER_ID,
      },
    });
  });

  it('sends one session-start push notification and deactivates invalid tokens', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      language: 'HY',
      pushNotificationsEnabled: true,
      pushTokens: [
        {
          id: 'push-1',
          token: 'fcm-token-1',
        },
        {
          id: 'push-2',
          token: 'fcm-token-2',
        },
      ],
    });
    templatesServiceMock.buildSessionStartedTemplate.mockReturnValue({
      body: 'Սեսիան մեկնարկել է',
      data: {
        eventType: 'SESSION_STARTED',
        sessionId: 'session-1',
        userId: USER_ID,
      },
      title: 'Լիցքավորումը սկսվել է',
    });
    fcmAdminClientMock.sendMulticast.mockResolvedValue({
      failureCount: 1,
      invalidTokens: ['fcm-token-2'],
      successCount: 1,
    });

    await service.sendSessionStartedNotification({
      sessionId: 'session-1',
      userId: USER_ID,
    });

    expect(templatesServiceMock.buildSessionStartedTemplate).toHaveBeenCalledWith({
      language: 'hy',
      sessionId: 'session-1',
      userId: USER_ID,
    });
    expect(fcmAdminClientMock.sendMulticast).toHaveBeenCalledWith({
      body: 'Սեսիան մեկնարկել է',
      data: {
        eventType: 'SESSION_STARTED',
        sessionId: 'session-1',
        userId: USER_ID,
      },
      title: 'Լիցքավորումը սկսվել է',
      tokens: ['fcm-token-1', 'fcm-token-2'],
    });
    expect(prismaMock.userPushToken.updateMany).toHaveBeenCalledWith({
      data: {
        isActive: false,
      },
      where: {
        token: {
          in: ['fcm-token-2'],
        },
        userId: USER_ID,
      },
    });
  });

  it('skips push delivery when user disables push notifications', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      language: 'EN',
      pushNotificationsEnabled: false,
      pushTokens: [
        {
          id: 'push-1',
          token: 'fcm-token-1',
        },
      ],
    });

    await service.sendPaymentSucceededNotification({
      paymentAmountAmd: 1800,
      sessionId: 'session-1',
      userId: USER_ID,
    });

    expect(templatesServiceMock.buildPaymentSucceededTemplate).not.toHaveBeenCalled();
    expect(fcmAdminClientMock.sendMulticast).not.toHaveBeenCalled();
  });
});
