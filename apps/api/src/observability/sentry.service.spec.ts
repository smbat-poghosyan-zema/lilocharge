import * as Sentry from '@sentry/node';

import { LoggerService } from './logger.service';
import { SentryService } from './sentry.service';

jest.mock('@sentry/node');

describe('SentryService', () => {
  let service: SentryService;
  let logger: LoggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new LoggerService({ level: 'silent', pretty: false });
    service = new SentryService(logger);
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENABLED;
    delete process.env.NODE_ENV;
  });

  describe('onModuleInit', () => {
    it('should not initialize when DSN is not configured', () => {
      delete process.env.SENTRY_DSN;
      service.onModuleInit();
      expect(Sentry.init).not.toHaveBeenCalled();
      expect(service.isInitialized()).toBe(false);
    });

    it('should not initialize when explicitly disabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.SENTRY_ENABLED = 'false';
      service.onModuleInit();
      expect(Sentry.init).not.toHaveBeenCalled();
      expect(service.isInitialized()).toBe(false);
    });

    it('should initialize when DSN is configured', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      service.onModuleInit();
      expect(Sentry.init).toHaveBeenCalled();
      expect(service.isInitialized()).toBe(true);
    });

    it('should use environment variables for configuration', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      process.env.APP_VERSION = '1.0.0';
      process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';

      service.onModuleInit();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          environment: 'production',
          release: '1.0.0',
          tracesSampleRate: 0.5,
        }),
      );
    });
  });

  describe('initialize', () => {
    it('should initialize Sentry with provided config', () => {
      const config = {
        dsn: 'https://test@sentry.io/123',
        environment: 'staging',
        release: '2.0.0',
        tracesSampleRate: 0.2,
        enabled: true,
      };

      service.initialize(config);

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: config.dsn,
          environment: config.environment,
          release: config.release,
          tracesSampleRate: config.tracesSampleRate,
          enabled: config.enabled,
        }),
      );
      expect(service.isInitialized()).toBe(true);
    });

    it('should not re-initialize if already initialized', () => {
      const config = { dsn: 'https://test@sentry.io/123', enabled: true };
      service.initialize(config);
      service.initialize(config);
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });

    it('should filter sensitive headers in beforeSend', () => {
      const config = { dsn: 'https://test@sentry.io/123', enabled: true };
      service.initialize(config);

      type SentryInitOptions = { beforeSend?: (event: unknown) => unknown };
      const mockCalls = (Sentry.init as jest.Mock).mock.calls as unknown[][];
      const initCall = mockCalls[0]?.[0] as SentryInitOptions | undefined;
      expect(initCall).toBeDefined();

      const event = {
        request: {
          headers: {
            authorization: 'Bearer token',
            cookie: 'session=abc',
            'x-custom': 'value',
          },
        },
      };

      const result = initCall?.beforeSend?.(event) as
        | { request?: { headers?: Record<string, string> } }
        | undefined;
      expect(result?.request?.headers).not.toHaveProperty('authorization');
      expect(result?.request?.headers).not.toHaveProperty('cookie');
      expect(result?.request?.headers).toHaveProperty('x-custom');
    });
  });

  describe('captureException', () => {
    it('should not capture when not initialized', () => {
      service.captureException(new Error('test'));
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('should capture exception when initialized', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      const error = new Error('test error');
      service.captureException(error);
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should set context before capturing', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      const error = new Error('test error');
      const context = { userId: '123', action: 'payment' };
      service.captureException(error, context);
      expect(Sentry.setContext).toHaveBeenCalledWith('custom', context);
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('captureMessage', () => {
    it('should not capture when not initialized', () => {
      service.captureMessage('test message');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('should capture message when initialized', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      service.captureMessage('test message', 'warning');
      expect(Sentry.captureMessage).toHaveBeenCalledWith('test message', 'warning');
    });

    it('should use info level by default', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      service.captureMessage('test message');
      expect(Sentry.captureMessage).toHaveBeenCalledWith('test message', 'info');
    });

    it('should set context before capturing', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      const context = { userId: '123' };
      service.captureMessage('test message', 'error', context);
      expect(Sentry.setContext).toHaveBeenCalledWith('custom', context);
    });
  });

  describe('setUser', () => {
    it('should not set user when not initialized', () => {
      service.setUser({ id: '123', email: 'test@example.com' });
      expect(Sentry.setUser).not.toHaveBeenCalled();
    });

    it('should set user when initialized', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      const user = { id: '123', email: 'test@example.com', username: 'testuser' };
      service.setUser(user);
      expect(Sentry.setUser).toHaveBeenCalledWith(user);
    });
  });

  describe('clearUser', () => {
    it('should not clear user when not initialized', () => {
      service.clearUser();
      expect(Sentry.setUser).not.toHaveBeenCalled();
    });

    it('should clear user when initialized', () => {
      service.initialize({ dsn: 'https://test@sentry.io/123', enabled: true });
      service.clearUser();
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });
  });
});
