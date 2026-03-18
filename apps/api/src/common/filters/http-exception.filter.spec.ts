import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpExceptionFilter } from './http-exception.filter';

interface ReplyMock {
  readonly payloads: unknown[];
  readonly statusCodes: number[];
  send(payload: unknown): ReplyMock;
  status(statusCode: number): ReplyMock;
}

interface RequestMock {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly url: string;
}

interface ErrorPayload {
  readonly message: string;
  readonly path?: string;
  readonly requestId?: string;
  readonly statusCode: number;
  readonly timestamp?: string;
}

/**
 * Builds an ArgumentsHost mock focused on the HTTP context used by the filter.
 */
function buildArgumentsHost(request: RequestMock, reply: ReplyMock): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: <T = FastifyRequest>() => request as unknown as T,
      getResponse: <T = FastifyReply>() => reply as unknown as T,
    }),
  } as unknown as ArgumentsHost;
}

/**
 * Creates a chainable Fastify reply mock and tracks status/payload calls.
 */
function createReplyMock(): ReplyMock {
  const statusCodes: number[] = [];
  const payloads: unknown[] = [];

  return {
    payloads,
    statusCodes,
    send(payload: unknown): ReplyMock {
      payloads.push(payload);
      return this;
    },
    status(statusCode: number): ReplyMock {
      statusCodes.push(statusCode);
      return this;
    },
  };
}

/**
 * Narrows unknown JSON values to the error payload shape used in assertions.
 */
function isErrorPayload(value: unknown): value is ErrorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return typeof payload.statusCode === 'number' && typeof payload.message === 'string';
}

describe('HttpExceptionFilter', () => {
  it('maps HttpException instances to standardized payloads', () => {
    const filter = new HttpExceptionFilter();
    const reply = createReplyMock();
    const request: RequestMock = {
      headers: {
        'x-request-id': 'req-123',
      },
      url: '/stations',
    };

    const exception = new BadRequestException({
      message: ['latitude must be a number'],
    });
    filter.catch(exception, buildArgumentsHost(request, reply));

    expect(reply.statusCodes).toEqual([400]);
    expect(reply.payloads).toHaveLength(1);

    const [rawPayload] = reply.payloads;
    expect(isErrorPayload(rawPayload)).toBe(true);
    if (!isErrorPayload(rawPayload)) {
      throw new Error('Expected error payload');
    }

    const payload = rawPayload;
    expect(payload.statusCode).toBe(400);
    expect(payload.message).toBe('latitude must be a number');
    expect(payload.path).toBe('/stations');
    expect(payload.requestId).toBe('req-123');
    expect(Number.isNaN(Date.parse(payload.timestamp ?? ''))).toBe(false);
  });

  it('handles unknown errors as internal server errors', () => {
    const filter = new HttpExceptionFilter();
    const reply = createReplyMock();
    const request: RequestMock = {
      headers: {},
      url: '/health',
    };

    filter.catch(new Error('unexpected failure'), buildArgumentsHost(request, reply));

    expect(reply.statusCodes).toEqual([500]);
    expect(reply.payloads).toHaveLength(1);

    const [rawPayload] = reply.payloads;
    expect(isErrorPayload(rawPayload)).toBe(true);
    if (!isErrorPayload(rawPayload)) {
      throw new Error('Expected error payload');
    }

    const payload = rawPayload;
    expect(payload.statusCode).toBe(500);
    expect(payload.message).toBe('Internal server error');
    expect(payload.requestId).toBeUndefined();
  });
});
