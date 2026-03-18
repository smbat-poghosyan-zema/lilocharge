import { PushNotificationPlatform } from '@lilocharge/shared-types';

import type { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import type { RegisterPushTokenDto } from './dto/register-push-token.dto';
import type { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';

interface NotificationsServiceMock {
  readonly registerPushToken: jest.Mock<Promise<void>, [string, RegisterPushTokenDto]>;
  readonly unregisterPushToken: jest.Mock<Promise<void>, [string, UnregisterPushTokenDto]>;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('NotificationsController', () => {
  it('delegates push-token register and unregister operations to the notifications service', async () => {
    const notificationsServiceMock: NotificationsServiceMock = {
      registerPushToken: jest
        .fn<Promise<void>, [string, RegisterPushTokenDto]>()
        .mockResolvedValue(),
      unregisterPushToken: jest
        .fn<Promise<void>, [string, UnregisterPushTokenDto]>()
        .mockResolvedValue(),
    };

    const controller = new NotificationsController(
      notificationsServiceMock as unknown as NotificationsService,
    );

    const registerPayload: RegisterPushTokenDto = {
      platform: PushNotificationPlatform.IOS,
      token: 'fcm-token-1',
    };

    const unregisterPayload: UnregisterPushTokenDto = {
      token: 'fcm-token-1',
    };

    await expect(controller.registerPushToken(USER_ID, registerPayload)).resolves.toBeUndefined();
    await expect(
      controller.unregisterPushToken(USER_ID, unregisterPayload),
    ).resolves.toBeUndefined();

    expect(notificationsServiceMock.registerPushToken).toHaveBeenCalledWith(
      USER_ID,
      registerPayload,
    );
    expect(notificationsServiceMock.unregisterPushToken).toHaveBeenCalledWith(
      USER_ID,
      unregisterPayload,
    );
  });
});
