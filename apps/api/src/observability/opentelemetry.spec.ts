import { initializeOpenTelemetry, shutdownOpenTelemetry } from './opentelemetry';

// Mock NodeSDK
jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/exporter-prometheus');
jest.mock('@opentelemetry/auto-instrumentations-node');

describe('OpenTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownOpenTelemetry();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_METRICS_PORT;
  });

  describe('initializeOpenTelemetry', () => {
    it('should initialize with default configuration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      initializeOpenTelemetry();
      expect(consoleSpy).toHaveBeenCalledWith(
        'OpenTelemetry initialized',
        expect.objectContaining({
          serviceName: 'lilocharge-api',
          metricsPort: 9464,
        }),
      );
      consoleSpy.mockRestore();
    });

    it('should not initialize when explicitly disabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.OTEL_ENABLED = 'false';
      initializeOpenTelemetry();
      expect(consoleSpy).toHaveBeenCalledWith('OpenTelemetry explicitly disabled');
      consoleSpy.mockRestore();
    });

    it('should not initialize when disabled via config', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      initializeOpenTelemetry({ enabled: false });
      expect(consoleSpy).toHaveBeenCalledWith('OpenTelemetry explicitly disabled');
      consoleSpy.mockRestore();
    });

    it('should use environment variables for configuration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.OTEL_SERVICE_NAME = 'test-service';
      process.env.OTEL_METRICS_PORT = '8080';

      initializeOpenTelemetry();

      expect(consoleSpy).toHaveBeenCalledWith(
        'OpenTelemetry initialized',
        expect.objectContaining({
          serviceName: 'test-service',
          metricsPort: 8080,
        }),
      );
      consoleSpy.mockRestore();
    });

    it('should use config over environment variables', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.OTEL_SERVICE_NAME = 'env-service';
      process.env.OTEL_METRICS_PORT = '8080';

      initializeOpenTelemetry({
        serviceName: 'config-service',
        metricsPort: 9090,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'OpenTelemetry initialized',
        expect.objectContaining({
          serviceName: 'config-service',
          metricsPort: 9090,
        }),
      );
      consoleSpy.mockRestore();
    });

    it('should warn when re-initializing', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      initializeOpenTelemetry();
      initializeOpenTelemetry();
      expect(consoleSpy).toHaveBeenCalledWith(
        'OpenTelemetry already initialized, skipping re-initialization',
      );
      consoleSpy.mockRestore();
      await shutdownOpenTelemetry();
    });
  });

  describe('shutdownOpenTelemetry', () => {
    it('should shutdown gracefully when initialized', async () => {
      initializeOpenTelemetry();
      await expect(shutdownOpenTelemetry()).resolves.not.toThrow();
    });

    it('should handle shutdown when not initialized', async () => {
      await expect(shutdownOpenTelemetry()).resolves.not.toThrow();
    });
  });
});
