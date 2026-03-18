import type { ApiErrorResponse } from '@lilocharge/shared-types';
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface HttpExceptionBody {
  readonly message?: string | string[];
}

/** Global exception filter to normalize API error responses. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  /** Converts Nest/Fastify exceptions into a stable JSON response contract. */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const reply = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();

    const statusCode = resolveStatusCode(exception);
    const requestId = resolveRequestId(request);

    const responseBody: ApiErrorResponse = {
      statusCode,
      message: resolveErrorMessage(exception),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    };

    reply.status(statusCode).send(responseBody);
  }
}

/**
 * Resolves HTTP status code for known Nest exceptions, defaulting to 500.
 */
function resolveStatusCode(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * Resolves the user-facing error message from Nest exception payloads.
 */
function resolveErrorMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (isHttpExceptionBody(response)) {
      if (Array.isArray(response.message)) {
        return response.message.join(', ');
      }

      if (typeof response.message === 'string') {
        return response.message;
      }
    }

    return exception.message;
  }

  return 'Internal server error';
}

/**
 * Extracts optional request ID header when present for log correlation.
 */
function resolveRequestId(request: FastifyRequest): string | undefined {
  const requestIdHeader = request.headers['x-request-id'];

  if (Array.isArray(requestIdHeader)) {
    return requestIdHeader[0];
  }

  return typeof requestIdHeader === 'string' ? requestIdHeader : undefined;
}

/**
 * Type guard for structured Nest HTTP exception responses.
 */
function isHttpExceptionBody(value: unknown): value is HttpExceptionBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate: HttpExceptionBody = value as HttpExceptionBody;
  return (
    candidate.message === undefined ||
    typeof candidate.message === 'string' ||
    Array.isArray(candidate.message)
  );
}
