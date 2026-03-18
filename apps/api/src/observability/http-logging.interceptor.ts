import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { LoggerService } from './logger.service';

/** Interceptor for logging HTTP requests and responses with Pino. */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Intercepts HTTP requests and logs request/response details.
   * @param context - Execution context
   * @param next - Call handler for next interceptor/handler
   */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startTime = Date.now();

    const requestId = this.resolveRequestId(request);
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.log('HTTP Request', {
            requestId,
            method,
            url,
            statusCode,
            duration,
            userAgent,
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 500;

          this.logger.error('HTTP Request Error', error.stack, {
            requestId,
            method,
            url,
            statusCode,
            duration,
            userAgent,
            errorMessage: error.message,
          });
        },
      }),
    );
  }

  /**
   * Extracts request ID from headers or generates a new one.
   * @param request - Fastify request object
   */
  private resolveRequestId(request: FastifyRequest): string {
    const requestIdHeader = request.headers['x-request-id'];

    if (Array.isArray(requestIdHeader)) {
      return requestIdHeader[0] ?? this.generateRequestId();
    }

    return typeof requestIdHeader === 'string' ? requestIdHeader : this.generateRequestId();
  }

  /**
   * Generates a simple request ID for tracking.
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
