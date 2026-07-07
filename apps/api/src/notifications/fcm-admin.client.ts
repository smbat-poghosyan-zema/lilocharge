import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import type { Messaging, SendResponse } from 'firebase-admin/messaging';
import { getMessaging } from 'firebase-admin/messaging';

import { resolveErrorMessage } from '../common/errors';

const DISABLED_FLAG_VALUES = ['0', 'false', 'off', 'disabled', 'no'];
const FCM_ADMIN_APP_NAME = 'lilocharge-fcm';

/** Injection token used for optional FCM admin client configuration overrides in unit tests. */
export const FCM_ADMIN_CLIENT_OPTIONS = 'FCM_ADMIN_CLIENT_OPTIONS';

/** Input payload used for sending one FCM multicast notification. */
export interface FcmSendMulticastInput {
  readonly body: string;
  readonly data: Record<string, string>;
  readonly title: string;
  readonly tokens: readonly string[];
}

/** Result payload returned by one FCM multicast send operation. */
export interface FcmSendMulticastResult {
  readonly failureCount: number;
  readonly invalidTokens: readonly string[];
  readonly successCount: number;
}

interface FcmAdminClientOptions {
  readonly messaging?: Messaging;
}

/**
 * Firebase Cloud Messaging admin client wrapper for typed multicast delivery and token-error mapping.
 */
@Injectable()
export class FcmAdminClient {
  private readonly logger: Logger = new Logger(FcmAdminClient.name);
  private messagingClient: Messaging | null | undefined;

  constructor(
    @Optional()
    @Inject(FCM_ADMIN_CLIENT_OPTIONS)
    options?: FcmAdminClientOptions,
  ) {
    this.messagingClient = options?.messaging;
  }

  /** Sends one multicast push notification to all provided tokens. */
  public async sendMulticast(input: FcmSendMulticastInput): Promise<FcmSendMulticastResult> {
    if (input.tokens.length === 0) {
      return buildEmptySendResult();
    }

    const messagingClient = this.resolveMessagingClient();
    if (messagingClient === null) {
      return buildEmptySendResult();
    }

    try {
      const response = await messagingClient.sendEachForMulticast({
        android: {
          priority: 'high',
        },
        data: input.data,
        notification: {
          body: input.body,
          title: input.title,
        },
        tokens: [...input.tokens],
      });

      return {
        failureCount: response.failureCount,
        invalidTokens: resolveInvalidTokens(response.responses, input.tokens),
        successCount: response.successCount,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `FCM multicast delivery failed: ${resolveErrorMessage(error, 'unknown transport error')}`,
      );
      return buildEmptySendResult();
    }
  }

  /** Resolves one memoized Messaging client using configured environment credentials. */
  private resolveMessagingClient(): Messaging | null {
    if (this.messagingClient !== undefined) {
      return this.messagingClient;
    }

    if (!isFcmEnabled(process.env.FCM_ENABLED)) {
      this.messagingClient = null;
      return this.messagingClient;
    }

    if (!canInitializeFirebaseFromEnvironment(process.env)) {
      this.messagingClient = null;
      return this.messagingClient;
    }

    try {
      const credentials = resolveServiceAccountCredentials(process.env);
      const app = resolveFirebaseApp(credentials);

      this.messagingClient = getMessaging(app);
      return this.messagingClient;
    } catch (error: unknown) {
      this.logger.warn(
        `FCM admin client initialization failed: ${resolveErrorMessage(error, 'unknown transport error')}`,
      );
      this.messagingClient = null;
      return this.messagingClient;
    }
  }
}

/** Resolves invalid tokens from FCM response failures by matching token-indexed send results. */
function resolveInvalidTokens(
  responses: readonly SendResponse[],
  tokens: readonly string[],
): readonly string[] {
  const invalidTokens: string[] = [];

  responses.forEach((response: SendResponse, index: number) => {
    if (response.success) {
      return;
    }

    const token = tokens[index];
    if (token === undefined) {
      return;
    }

    if (isInvalidTokenError(response.error)) {
      invalidTokens.push(token);
    }
  });

  return invalidTokens;
}

/** Resolves whether FCM delivery is enabled from optional environment flag values. */
function isFcmEnabled(rawFlag: string | undefined): boolean {
  if (rawFlag === undefined) {
    return true;
  }

  const normalizedFlag = rawFlag.trim().toLowerCase();
  return !DISABLED_FLAG_VALUES.includes(normalizedFlag);
}

/** Resolves whether enough credential context exists to initialize Firebase admin messaging. */
function canInitializeFirebaseFromEnvironment(environment: NodeJS.ProcessEnv): boolean {
  return (
    hasFirebaseServiceAccount(environment) ||
    normalizeOptionalString(environment.GOOGLE_APPLICATION_CREDENTIALS) !== undefined ||
    normalizeOptionalString(environment.FIREBASE_CONFIG) !== undefined
  );
}

/** Resolves one named Firebase app instance, creating it when missing. */
function resolveFirebaseApp(credentials: ServiceAccount | null): App {
  if (getApps().some((app: App) => app.name === FCM_ADMIN_APP_NAME)) {
    return getApp(FCM_ADMIN_APP_NAME);
  }

  if (credentials === null) {
    return initializeApp({}, FCM_ADMIN_APP_NAME);
  }

  return initializeApp(
    {
      credential: cert(credentials),
      projectId: credentials.projectId,
    },
    FCM_ADMIN_APP_NAME,
  );
}

/** Resolves Firebase service-account credentials from environment variables when fully configured. */
function resolveServiceAccountCredentials(environment: NodeJS.ProcessEnv): ServiceAccount | null {
  const projectId = normalizeOptionalString(
    environment.FCM_PROJECT_ID ?? environment.FIREBASE_PROJECT_ID,
  );
  const clientEmail = normalizeOptionalString(
    environment.FCM_CLIENT_EMAIL ?? environment.FIREBASE_CLIENT_EMAIL,
  );
  const privateKey = normalizeOptionalString(
    environment.FCM_PRIVATE_KEY ?? environment.FIREBASE_PRIVATE_KEY,
  );

  if (projectId === undefined || clientEmail === undefined || privateKey === undefined) {
    return null;
  }

  return {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    projectId,
  };
}

/** Returns whether all required Firebase service-account variables are present. */
function hasFirebaseServiceAccount(environment: NodeJS.ProcessEnv): boolean {
  const credentials = resolveServiceAccountCredentials(environment);
  return credentials !== null;
}

/** Identifies token-level FCM failures caused by invalid or expired registration tokens. */
function isInvalidTokenError(error: SendResponse['error']): boolean {
  const code = error?.code;

  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered'
  );
}

/** Normalizes optional environment strings by trimming whitespace and removing empty values. */
function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
}

/** Builds one empty send result used for disabled or skipped dispatch operations. */
function buildEmptySendResult(): FcmSendMulticastResult {
  return {
    failureCount: 0,
    invalidTokens: [],
    successCount: 0,
  };
}
