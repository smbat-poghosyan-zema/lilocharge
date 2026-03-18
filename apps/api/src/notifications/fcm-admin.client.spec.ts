import type { Messaging, SendResponse } from 'firebase-admin/messaging';

import { FcmAdminClient } from './fcm-admin.client';

interface MessagingMock extends Pick<Messaging, 'sendEachForMulticast'> {
  readonly sendEachForMulticast: jest.Mock<
    ReturnType<Messaging['sendEachForMulticast']>,
    Parameters<Messaging['sendEachForMulticast']>
  >;
}

function buildFailedResponse(code: string): SendResponse {
  return {
    error: {
      code,
      message: code,
      name: 'FirebaseError',
    } as unknown as SendResponse['error'],
    success: false,
  };
}

describe('FcmAdminClient', () => {
  const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('skips gateway calls for empty token arrays', async () => {
    const messagingMock: MessagingMock = {
      sendEachForMulticast: jest.fn<
        ReturnType<Messaging['sendEachForMulticast']>,
        Parameters<Messaging['sendEachForMulticast']>
      >(),
    };
    const client = new FcmAdminClient({ messaging: messagingMock as unknown as Messaging });

    const result = await client.sendMulticast({
      body: 'body',
      data: {
        eventType: 'SESSION_STARTED',
      },
      title: 'title',
      tokens: [],
    });

    expect(result).toEqual({
      failureCount: 0,
      invalidTokens: [],
      successCount: 0,
    });
    expect(messagingMock.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('extracts invalid device tokens from failed FCM responses', async () => {
    const messagingMock: MessagingMock = {
      sendEachForMulticast: jest
        .fn<
          ReturnType<Messaging['sendEachForMulticast']>,
          Parameters<Messaging['sendEachForMulticast']>
        >()
        .mockResolvedValue({
          failureCount: 2,
          responses: [
            {
              messageId: 'message-1',
              success: true,
            },
            buildFailedResponse('messaging/registration-token-not-registered'),
            buildFailedResponse('messaging/internal-error'),
          ],
          successCount: 1,
        }),
    };
    const client = new FcmAdminClient({ messaging: messagingMock as unknown as Messaging });

    const result = await client.sendMulticast({
      body: 'body',
      data: {
        eventType: 'SESSION_STARTED',
      },
      title: 'title',
      tokens: ['token-1', 'token-2', 'token-3'],
    });

    expect(result).toEqual({
      failureCount: 2,
      invalidTokens: ['token-2'],
      successCount: 1,
    });
    expect(messagingMock.sendEachForMulticast).toHaveBeenCalledWith({
      android: {
        priority: 'high',
      },
      data: {
        eventType: 'SESSION_STARTED',
      },
      notification: {
        body: 'body',
        title: 'title',
      },
      tokens: ['token-1', 'token-2', 'token-3'],
    });
  });

  it('returns fallback result when FCM is disabled in environment', async () => {
    process.env = {
      ...originalEnvironment,
      FCM_ENABLED: 'false',
    };

    const client = new FcmAdminClient();
    const result = await client.sendMulticast({
      body: 'body',
      data: {
        eventType: 'SESSION_STARTED',
      },
      title: 'title',
      tokens: ['token-1'],
    });

    expect(result).toEqual({
      failureCount: 0,
      invalidTokens: [],
      successCount: 0,
    });
  });
});
