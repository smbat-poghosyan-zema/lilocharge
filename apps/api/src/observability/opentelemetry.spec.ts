import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node';

import { initializeOpenTelemetry, shutdownOpenTelemetry } from './opentelemetry';

// Mock NodeSDK
jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/exporter-prometheus');
jest.mock('@opentelemetry/auto-instrumentations-node');

const NodeSDKMock = NodeSDK as jest.MockedClass<typeof NodeSDK>;

/** Reads the configuration passed to the most recent NodeSDK construction. */
function getLastNodeSdkConfig(): Partial<NodeSDKConfiguration> {
  const lastCall = NodeSDKMock.mock.calls[NodeSDKMock.mock.calls.length - 1];
  expect(lastCall).toBeDefined();
  return lastCall?.[0] ?? {};
}

describe('OpenTelemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await shutdownOpenTelemetry();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_METRICS_PORT;
    delete process.env.OTEL_TRACES_EXPORTER;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
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

    it('should register the Prometheus exporter as a NodeSDK metric reader', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      initializeOpenTelemetry({ metricsPort: 9464 });

      expect(PrometheusExporter).toHaveBeenCalledWith({ port: 9464 });
      const config = getLastNodeSdkConfig();
      expect(config.metricReaders).toHaveLength(1);
      expect(config.metricReaders?.[0]).toBe(
        (PrometheusExporter as jest.MockedClass<typeof PrometheusExporter>).mock.instances[0],
      );
      consoleSpy.mockRestore();
    });

    it('should install a no-op span processor when no trace export env vars are set', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      initializeOpenTelemetry();

      const config = getLastNodeSdkConfig();
      expect(config.spanProcessors).toHaveLength(1);
      const processor = config.spanProcessors?.[0];
      expect(processor).toBeDefined();
      expect(typeof processor?.forceFlush).toBe('function');
      expect(typeof processor?.onStart).toBe('function');
      expect(typeof processor?.onEnd).toBe('function');
      expect(typeof processor?.shutdown).toBe('function');
      expect(consoleSpy).toHaveBeenCalledWith(
        'OpenTelemetry initialized',
        expect.objectContaining({ traceExportMode: 'noop (no export)' }),
      );
      consoleSpy.mockRestore();
    });

    it.each(['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'])(
      'should defer span processors to NodeSDK env config when %s is set',
      (envVar) => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        process.env[envVar] = 'http://collector:4318';

        initializeOpenTelemetry();

        const config = getLastNodeSdkConfig();
        expect(config.spanProcessors).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith(
          'OpenTelemetry initialized',
          expect.objectContaining({ traceExportMode: 'env (otlp default)' }),
        );
        consoleSpy.mockRestore();
      },
    );

    it('should defer span processors to NodeSDK env config when OTEL_TRACES_EXPORTER is set', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.OTEL_TRACES_EXPORTER = 'console';

      initializeOpenTelemetry();

      const config = getLastNodeSdkConfig();
      expect(config.spanProcessors).toBeUndefined();
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
