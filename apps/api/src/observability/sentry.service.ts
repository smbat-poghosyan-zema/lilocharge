import * as Sentry from '@sentry/node';
import { Injectable, type OnModuleInit } from '@nestjs/common';

import { LoggerService } from './logger.service';

/** Configuration options for Sentry integration. */
export interface SentryConfig {
  readonly dsn: string;
  readonly environment?: string;
  readonly release?: string;
  readonly tracesSampleRate?: number;
  readonly enabled?: boolean;
}

/** Service responsible for initializing and managing Sentry error tracking. */
@Injectable()
export class SentryService implements OnModuleInit {
  private initialized = false;

  constructor(private readonly logger: LoggerService) {}

  /** Initializes Sentry SDK with environment-based configuration on module initialization. */
  public onModuleInit(): void {
    const dsn = process.env.SENTRY_DSN;
    const enabled = process.env.SENTRY_ENABLED !== 'false';

    if (!dsn) {
      this.logger.warn('Sentry DSN not configured, error tracking disabled');
      return;
    }

    if (!enabled) {
      this.logger.log('Sentry explicitly disabled via SENTRY_ENABLED=false');
      return;
    }

    const config: SentryConfig = {
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      release: process.env.APP_VERSION,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
      enabled,
    };

    this.initialize(config);
  }

  /**
   * Initializes Sentry with the provided configuration.
   * @param config - Sentry configuration options
   */
  public initialize(config: SentryConfig): void {
    if (this.initialized) {
      this.logger.warn('Sentry already initialized, skipping re-initialization');
      return;
    }

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment ?? 'development',
      release: config.release,
      tracesSampleRate: config.tracesSampleRate ?? 0.1,
      enabled: config.enabled ?? true,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.nativeNodeFetchIntegration(),
        Sentry.anrIntegration({ captureStackTrace: true }),
      ],
      beforeSend(event) {
        // Filter out sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        return event;
      },
    });

    this.initialized = true;
    this.logger.log('Sentry initialized', {
      environment: config.environment,
      release: config.release,
      tracesSampleRate: config.tracesSampleRate,
    });
  }

  /**
   * Captures an exception and sends it to Sentry.
   * @param exception - The exception to capture
   * @param context - Optional context for additional metadata
   */
  public captureException(exception: unknown, context?: Record<string, unknown>): void {
    if (!this.initialized) {
      return;
    }

    if (context) {
      Sentry.setContext('custom', context);
    }

    Sentry.captureException(exception);
  }

  /**
   * Captures a message and sends it to Sentry.
   * @param message - The message to capture
   * @param level - The severity level
   * @param context - Optional context for additional metadata
   */
  public captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: Record<string, unknown>,
  ): void {
    if (!this.initialized) {
      return;
    }

    if (context) {
      Sentry.setContext('custom', context);
    }

    Sentry.captureMessage(message, level);
  }

  /**
   * Sets user context for Sentry events.
   * @param user - User information
   */
  public setUser(user: { id: string; email?: string; username?: string }): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setUser(user);
  }

  /**
   * Clears the current user context.
   */
  public clearUser(): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setUser(null);
  }

  /**
   * Returns whether Sentry has been initialized.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
}
