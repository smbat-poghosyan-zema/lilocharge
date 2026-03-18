import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService({ level: 'debug', pretty: false });
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const defaultService = new LoggerService();
      expect(defaultService).toBeDefined();
      expect(defaultService.getPinoLogger()).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customService = new LoggerService({
        level: 'warn',
        serviceName: 'test-service',
        pretty: false,
      });
      expect(customService).toBeDefined();
    });

    it('should use environment variables for config', () => {
      process.env.LOG_LEVEL = 'error';
      const envService = new LoggerService();
      expect(envService).toBeDefined();
      delete process.env.LOG_LEVEL;
    });
  });

  describe('log', () => {
    it('should log informational messages', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'info');
      service.log('Test message');
      expect(spy).toHaveBeenCalledWith({}, 'Test message');
    });

    it('should log with context', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'info');
      const context = { userId: '123', action: 'login' };
      service.log('User logged in', context);
      expect(spy).toHaveBeenCalledWith(context, 'User logged in');
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'error');
      service.error('Error occurred');
      expect(spy).toHaveBeenCalledWith({ trace: undefined }, 'Error occurred');
    });

    it('should log errors with trace', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'error');
      const trace = 'Error: Test\n  at Object.<anonymous>';
      service.error('Error occurred', trace);
      expect(spy).toHaveBeenCalledWith({ trace }, 'Error occurred');
    });

    it('should log errors with context', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'error');
      const context = { userId: '123' };
      const trace = 'Error stack trace';
      service.error('Error occurred', trace, context);
      expect(spy).toHaveBeenCalledWith({ ...context, trace }, 'Error occurred');
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'warn');
      service.warn('Warning message');
      expect(spy).toHaveBeenCalledWith({}, 'Warning message');
    });

    it('should log warnings with context', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'warn');
      const context = { threshold: 80 };
      service.warn('CPU usage high', context);
      expect(spy).toHaveBeenCalledWith(context, 'CPU usage high');
    });
  });

  describe('debug', () => {
    it('should log debug messages', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'debug');
      service.debug('Debug message');
      expect(spy).toHaveBeenCalledWith({}, 'Debug message');
    });
  });

  describe('verbose', () => {
    it('should log verbose messages', () => {
      const spy = jest.spyOn(service.getPinoLogger(), 'trace');
      service.verbose('Verbose message');
      expect(spy).toHaveBeenCalledWith({}, 'Verbose message');
    });
  });

  describe('getPinoLogger', () => {
    it('should return the underlying Pino logger', () => {
      const logger = service.getPinoLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });
});
