import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

/** Configuration options for OpenTelemetry initialization. */
export interface OpenTelemetryConfig {
  readonly serviceName?: string;
  readonly enabled?: boolean;
  readonly metricsPort?: number;
}

let sdk: NodeSDK | undefined;

/**
 * Initializes OpenTelemetry SDK with auto-instrumentation and Prometheus metrics export.
 * Should be called before any application code is loaded.
 * @param config - OpenTelemetry configuration options
 */
export function initializeOpenTelemetry(config?: OpenTelemetryConfig): void {
  const enabled = config?.enabled ?? process.env.OTEL_ENABLED !== 'false';

  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log('OpenTelemetry explicitly disabled');
    return;
  }

  if (sdk) {
    // eslint-disable-next-line no-console
    console.warn('OpenTelemetry already initialized, skipping re-initialization');
    return;
  }

  const serviceName = config?.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'lilocharge-api';
  const metricsPort = config?.metricsPort ?? parseInt(process.env.OTEL_METRICS_PORT ?? '9464', 10);

  // Configure Prometheus exporter for metrics (pull-based)
  const prometheusExporter = new PrometheusExporter({
    port: metricsPort,
  });

  // Create MeterProvider with Prometheus exporter
  const meterProvider = new MeterProvider({
    readers: [prometheusExporter],
  });

  // Register meter provider globally (unused but required for setup)
  void meterProvider;

  sdk = new NodeSDK({
    serviceName,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Configure auto-instrumentation
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable FS instrumentation to reduce noise
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (request) => {
            // Ignore health check endpoints
            const url = request.url ?? '';
            return url.includes('/health') || url.includes('/metrics');
          },
        },
      }),
    ],
  });

  sdk.start();

  // eslint-disable-next-line no-console
  console.log('OpenTelemetry initialized', {
    serviceName,
    metricsPort,
  });

  // Gracefully shutdown SDK on process termination
  process.on('SIGTERM', () => {
    void (async () => {
      try {
        await sdk?.shutdown();
        // eslint-disable-next-line no-console
        console.log('OpenTelemetry SDK shut down successfully');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error shutting down OpenTelemetry SDK', error);
      }
    })();
  });
}

/**
 * Shuts down the OpenTelemetry SDK gracefully.
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
  sdk = undefined;
}
