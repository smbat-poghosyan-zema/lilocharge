import { PushNotificationEventType } from '@lilocharge/shared-types';
import type { SupportedLanguageCode } from '@lilocharge/shared-types';
import { Injectable } from '@nestjs/common';

/** Template payload returned for one FCM notification build operation. */
export interface PushNotificationTemplate {
  readonly body: string;
  readonly data: Record<string, string>;
  readonly title: string;
}

interface BaseTemplateInput {
  readonly language: SupportedLanguageCode;
  readonly sessionId: string;
  readonly userId: string;
}

interface SessionCompletedTemplateInput extends BaseTemplateInput {
  readonly totalCostAmd: number;
}

interface PaymentFailedTemplateInput extends BaseTemplateInput {
  readonly failureReason?: string;
}

interface PaymentSucceededTemplateInput extends BaseTemplateInput {
  readonly paymentAmountAmd: number;
}

/**
 * Service responsible for assembling localized push-notification text and data payloads.
 */
@Injectable()
export class NotificationTemplatesService {
  /** Builds one localized session-started push template. */
  public buildSessionStartedTemplate(input: BaseTemplateInput): PushNotificationTemplate {
    return {
      body: resolveLocalizedText(input.language, {
        en: `Session ${input.sessionId} is now active.`,
        hy: `Սեսիա ${input.sessionId}-ը այժմ ակտիվ է։`,
        ru: `Сессия ${input.sessionId} сейчас активна.`,
      }),
      data: {
        eventType: PushNotificationEventType.SESSION_STARTED,
        sessionId: input.sessionId,
        userId: input.userId,
      },
      title: resolveLocalizedText(input.language, {
        en: 'Charging session started',
        hy: 'Լիցքավորումը սկսվել է',
        ru: 'Зарядка началась',
      }),
    };
  }

  /** Builds one localized session-completed push template. */
  public buildSessionCompletedTemplate(
    input: SessionCompletedTemplateInput,
  ): PushNotificationTemplate {
    return {
      body: resolveLocalizedText(input.language, {
        en: `Session ${input.sessionId} is complete. Total cost: ${input.totalCostAmd} AMD.`,
        hy: `Սեսիա ${input.sessionId}-ը ավարտվել է։ Ընդհանուր արժեքը՝ ${input.totalCostAmd} դրամ։`,
        ru: `Сессия ${input.sessionId} завершена. Итоговая сумма: ${input.totalCostAmd} AMD.`,
      }),
      data: {
        eventType: PushNotificationEventType.SESSION_COMPLETED,
        sessionId: input.sessionId,
        totalCostAmd: String(input.totalCostAmd),
        userId: input.userId,
      },
      title: resolveLocalizedText(input.language, {
        en: 'Charging session completed',
        hy: 'Լիցքավորումն ավարտվել է',
        ru: 'Зарядка завершена',
      }),
    };
  }

  /** Builds one localized payment-succeeded push template. */
  public buildPaymentSucceededTemplate(
    input: PaymentSucceededTemplateInput,
  ): PushNotificationTemplate {
    return {
      body: resolveLocalizedText(input.language, {
        en: `Payment for session ${input.sessionId} succeeded: ${input.paymentAmountAmd} AMD.`,
        hy: `Սեսիա ${input.sessionId}-ի վճարումը հաջողվել է՝ ${input.paymentAmountAmd} դրամ։`,
        ru: `Оплата по сессии ${input.sessionId} прошла успешно: ${input.paymentAmountAmd} AMD.`,
      }),
      data: {
        eventType: PushNotificationEventType.PAYMENT_SUCCEEDED,
        paymentAmountAmd: String(input.paymentAmountAmd),
        sessionId: input.sessionId,
        userId: input.userId,
      },
      title: resolveLocalizedText(input.language, {
        en: 'Payment successful',
        hy: 'Վճարումը հաջողվել է',
        ru: 'Оплата успешна',
      }),
    };
  }

  /** Builds one localized payment-failed push template. */
  public buildPaymentFailedTemplate(input: PaymentFailedTemplateInput): PushNotificationTemplate {
    return {
      body: resolveLocalizedText(input.language, {
        en: `Payment for session ${input.sessionId} failed. Please try another payment method.`,
        hy: `Սեսիա ${input.sessionId}-ի վճարումը ձախողվել է։ Փորձեք այլ վճարման եղանակ։`,
        ru: `Не удалось списать оплату по сессии ${input.sessionId}. Попробуйте другой способ оплаты.`,
      }),
      data: {
        ...(input.failureReason !== undefined
          ? {
              failureReason: input.failureReason,
            }
          : {}),
        eventType: PushNotificationEventType.PAYMENT_FAILED,
        sessionId: input.sessionId,
        userId: input.userId,
      },
      title: resolveLocalizedText(input.language, {
        en: 'Payment failed',
        hy: 'Վճարումը ձախողվել է',
        ru: 'Ошибка оплаты',
      }),
    };
  }
}

/** Resolves one localized value from Armenian/Russian/English alternatives. */
function resolveLocalizedText(
  language: SupportedLanguageCode,
  localized: {
    readonly en: string;
    readonly hy: string;
    readonly ru: string;
  },
): string {
  if (language === 'ru') {
    return localized.ru;
  }

  if (language === 'en') {
    return localized.en;
  }

  return localized.hy;
}
