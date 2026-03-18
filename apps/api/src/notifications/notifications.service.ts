import type {
  RegisterPushTokenRequest,
  SupportedLanguageCode,
  UnregisterPushTokenRequest,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Language, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { FcmAdminClient } from './fcm-admin.client';
import { NotificationTemplatesService } from './notification-templates.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';

const USER_ID_SELECT = {
  id: true,
} satisfies Prisma.UserSelect;

const USER_NOTIFICATION_LOOKUP_SELECT = {
  id: true,
  language: true,
  pushNotificationsEnabled: true,
  pushTokens: {
    select: {
      id: true,
      token: true,
    },
    where: {
      isActive: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserNotificationLookupRecord = Prisma.UserGetPayload<{
  select: typeof USER_NOTIFICATION_LOOKUP_SELECT;
}>;

/** Input used to send one session-start push notification. */
export interface SessionStartedNotificationInput {
  readonly sessionId: string;
  readonly userId: string;
}

/** Input used to send one session-completed push notification. */
export interface SessionCompletedNotificationInput {
  readonly sessionId: string;
  readonly totalCostAmd: number;
  readonly userId: string;
}

/** Input used to send one payment-succeeded push notification. */
export interface PaymentSucceededNotificationInput {
  readonly paymentAmountAmd: number;
  readonly sessionId: string;
  readonly userId: string;
}

/** Input used to send one payment-failed push notification. */
export interface PaymentFailedNotificationInput {
  readonly failureReason?: string;
  readonly sessionId: string;
  readonly userId: string;
}

/**
 * Service responsible for push-token registration and template-based FCM delivery orchestration.
 */
@Injectable()
export class NotificationsService {
  private readonly logger: Logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationTemplatesService: NotificationTemplatesService,
    private readonly fcmAdminClient: FcmAdminClient,
  ) {}

  /** Registers one push token for a user by upserting token ownership and active state. */
  public async registerPushToken(userId: string, request: RegisterPushTokenRequest): Promise<void> {
    await this.assertUserExists(userId);
    const normalizedToken = normalizeRequiredToken(request.token);

    await this.prismaService.userPushToken.upsert({
      create: {
        isActive: true,
        platform: request.platform,
        token: normalizedToken,
        userId,
      },
      update: {
        isActive: true,
        platform: request.platform,
        token: normalizedToken,
        userId,
      },
      where: {
        token: normalizedToken,
      },
    });
  }

  /** Marks one push token inactive for a user so future notifications are skipped. */
  public async unregisterPushToken(
    userId: string,
    request: UnregisterPushTokenRequest,
  ): Promise<void> {
    await this.assertUserExists(userId);
    const normalizedToken = normalizeRequiredToken(request.token);

    await this.prismaService.userPushToken.updateMany({
      data: {
        isActive: false,
      },
      where: {
        token: normalizedToken,
        userId,
      },
    });
  }

  /** Sends one session-started push notification to all active user tokens when enabled. */
  public async sendSessionStartedNotification(
    input: SessionStartedNotificationInput,
  ): Promise<void> {
    await this.sendTemplateNotification(input.userId, (language: SupportedLanguageCode) => {
      return this.notificationTemplatesService.buildSessionStartedTemplate({
        language,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    });
  }

  /** Sends one session-completed push notification to all active user tokens when enabled. */
  public async sendSessionCompletedNotification(
    input: SessionCompletedNotificationInput,
  ): Promise<void> {
    await this.sendTemplateNotification(input.userId, (language: SupportedLanguageCode) => {
      return this.notificationTemplatesService.buildSessionCompletedTemplate({
        language,
        sessionId: input.sessionId,
        totalCostAmd: input.totalCostAmd,
        userId: input.userId,
      });
    });
  }

  /** Sends one payment-succeeded push notification to all active user tokens when enabled. */
  public async sendPaymentSucceededNotification(
    input: PaymentSucceededNotificationInput,
  ): Promise<void> {
    await this.sendTemplateNotification(input.userId, (language: SupportedLanguageCode) => {
      return this.notificationTemplatesService.buildPaymentSucceededTemplate({
        language,
        paymentAmountAmd: input.paymentAmountAmd,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    });
  }

  /** Sends one payment-failed push notification to all active user tokens when enabled. */
  public async sendPaymentFailedNotification(input: PaymentFailedNotificationInput): Promise<void> {
    await this.sendTemplateNotification(input.userId, (language: SupportedLanguageCode) => {
      return this.notificationTemplatesService.buildPaymentFailedTemplate({
        failureReason: input.failureReason,
        language,
        sessionId: input.sessionId,
        userId: input.userId,
      });
    });
  }

  /** Validates one user id exists before token registration/unregistration operations run. */
  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      select: USER_ID_SELECT,
      where: {
        id: userId,
      },
    });

    if (user === null) {
      throw new NotFoundException(USER_NOT_FOUND_MESSAGE);
    }
  }

  /** Resolves one user profile with notification preference and active token data for delivery. */
  private async findUserNotificationTarget(
    userId: string,
  ): Promise<UserNotificationLookupRecord | null> {
    return this.prismaService.user.findUnique({
      select: USER_NOTIFICATION_LOOKUP_SELECT,
      where: {
        id: userId,
      },
    });
  }

  /** Builds one template, sends to active tokens, and deactivates invalid tokens from FCM response. */
  private async sendTemplateNotification(
    userId: string,
    buildTemplate: (language: SupportedLanguageCode) => {
      readonly body: string;
      readonly data: Record<string, string>;
      readonly title: string;
    },
  ): Promise<void> {
    try {
      const target = await this.findUserNotificationTarget(userId);

      if (target === null || !target.pushNotificationsEnabled || target.pushTokens.length === 0) {
        return;
      }

      const tokens = target.pushTokens.map((token) => token.token);
      const template = buildTemplate(mapLanguageEnumToCode(target.language));
      const sendResult = await this.fcmAdminClient.sendMulticast({
        body: template.body,
        data: template.data,
        title: template.title,
        tokens,
      });

      if (sendResult.invalidTokens.length === 0) {
        return;
      }

      await this.prismaService.userPushToken.updateMany({
        data: {
          isActive: false,
        },
        where: {
          token: {
            in: [...sendResult.invalidTokens],
          },
          userId,
        },
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Push notification delivery failed for user ${userId}: ${resolveErrorMessage(error)}`,
      );
    }
  }
}

/** Maps Prisma language enum values into supported shared-language codes. */
function mapLanguageEnumToCode(language: Language): SupportedLanguageCode {
  if (language === 'RU') {
    return 'ru';
  }

  if (language === 'EN') {
    return 'en';
  }

  return 'hy';
}

/** Normalizes a required token string and rejects empty values. */
function normalizeRequiredToken(token: string): string {
  const normalizedToken = token.trim();

  if (normalizedToken.length === 0) {
    throw new BadRequestException('token is required');
  }

  return normalizedToken;
}

/** Resolves log-friendly error text for unknown thrown values. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown notification error';
}
