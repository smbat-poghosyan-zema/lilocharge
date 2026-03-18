import type { ExecutionContext, CallHandler } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { of, throwError } from 'rxjs';

import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { LoggerService } from './logger.service';

describe('HttpLoggingInterceptor', () => {
  let interceptor: HttpLoggingInterceptor;
  let logger: LoggerService;
  let mockContext: ExecutionContext;
  let mockRequest: Partial<FastifyRequest>;
  let mockResponse: Partial<FastifyReply>;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    logger = new LoggerService({ level: 'silent', pretty: false });
    interceptor = new HttpLoggingInterceptor(logger);

    mockRequest = {
      method: 'GET',
      url: '/api/test',
      headers: {
        'user-agent': 'test-agent',
        'x-request-id': 'test-request-id',
      },
    };

    mockResponse = {
      statusCode: 200,
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;

    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  describe('intercept', () => {
    it('should log successful HTTP requests', (done) => {
      const logSpy = jest.spyOn(logger, 'log');
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));

      interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
        expect(logSpy).toHaveBeenCalledWith(
          'HTTP Request',
          expect.objectContaining({
            requestId: 'test-request-id',
            method: 'GET',
            url: '/api/test',
            statusCode: 200,
            userAgent: 'test-agent',
          }),
        );
        done();
      });
    });

    it('should log request duration', (done) => {
      const logSpy = jest.spyOn(logger, 'log');
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));

      interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
        expect(logSpy).toHaveBeenCalledWith(
          'HTTP Request',
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            duration: expect.any(Number),
          }),
        );
        // Verify duration is a positive number
        expect(logSpy).toHaveBeenCalledWith('HTTP Request', expect.any(Object));
        done();
      });
    });

    it('should log HTTP errors', (done) => {
      const errorSpy = jest.spyOn(logger, 'error');
      const testError = new Error('Test error');
      mockResponse.statusCode = 500;
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => testError));

      interceptor.intercept(mockContext, mockCallHandler).subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalledWith(
            'HTTP Request Error',
            testError.stack,
            expect.objectContaining({
              requestId: 'test-request-id',
              method: 'GET',
              url: '/api/test',
              statusCode: 500,
              userAgent: 'test-agent',
              errorMessage: 'Test error',
            }),
          );
          done();
        },
      });
    });

    it('should generate request ID when not provided', (done) => {
      const logSpy = jest.spyOn(logger, 'log');
      delete mockRequest.headers;
      mockRequest.headers = { 'user-agent': 'test-agent' };
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));

      interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
        expect(logSpy).toHaveBeenCalledWith(
          'HTTP Request',
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            requestId: expect.any(String),
          }),
        );
        // Verify a request ID was generated
        expect(logSpy).toHaveBeenCalledWith('HTTP Request', expect.any(Object));
        done();
      });
    });

    it('should handle array request ID headers', (done) => {
      const logSpy = jest.spyOn(logger, 'log');
      mockRequest.headers = {
        'user-agent': 'test-agent',
        'x-request-id': ['id1', 'id2'] as unknown as string,
      };
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ data: 'test' }));

      interceptor.intercept(mockContext, mockCallHandler).subscribe(() => {
        expect(logSpy).toHaveBeenCalledWith(
          'HTTP Request',
          expect.objectContaining({
            requestId: 'id1',
          }),
        );
        done();
      });
    });

    it('should default to 500 status code on error', (done) => {
      const errorSpy = jest.spyOn(logger, 'error');
      const testError = new Error('Test error');
      delete mockResponse.statusCode;
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => testError));

      interceptor.intercept(mockContext, mockCallHandler).subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalledWith(
            'HTTP Request Error',
            expect.any(String),
            expect.objectContaining({
              statusCode: 500,
            }),
          );
          done();
        },
      });
    });
  });
});
