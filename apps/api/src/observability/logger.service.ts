import { Injectable, type LoggerService as NestLoggerService } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';

/** Configuration options for Pino logger initialization. */
export interface LoggerConfig {
  readonly level?: string;
  readonly pretty?: boolean;
  readonly serviceName?: string;
}

/** Pino-based structured logger service for NestJS. */
@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: PinoLogger;

  constructor(config?: LoggerConfig) {
    const level = config?.level ?? process.env.LOG_LEVEL ?? 'info';
    const serviceName = config?.serviceName ?? 'lilocharge-api';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const shouldPretty = config?.pretty ?? isDevelopment;

    this.logger = pino({
      level,
      name: serviceName,
      ...(shouldPretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  /**
   * Logs an informational message with optional context.
   * @param message - The log message
   * @param context - Optional context object for structured logging
   */
  public log(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, message);
  }

  /**
   * Logs an error message with optional context and stack trace.
   * @param message - The error message
   * @param trace - Optional stack trace
   * @param context - Optional context object
   */
  public error(message: string, trace?: string, context?: Record<string, unknown>): void {
    this.logger.error({ ...context, trace }, message);
  }

  /**
   * Logs a warning message with optional context.
   * @param message - The warning message
   * @param context - Optional context object
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, message);
  }

  /**
   * Logs a debug message with optional context.
   * @param message - The debug message
   * @param context - Optional context object
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context ?? {}, message);
  }

  /**
   * Logs a verbose message with optional context.
   * @param message - The verbose message
   * @param context - Optional context object
   */
  public verbose(message: string, context?: Record<string, unknown>): void {
    this.logger.trace(context ?? {}, message);
  }

  /**
   * Returns the underlying Pino logger instance for advanced use cases.
   */
  public getPinoLogger(): PinoLogger {
    return this.logger;
  }
}
