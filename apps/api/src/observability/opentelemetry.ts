import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

/** Configuration options for OpenTelemetry initialization. */
export interface OpenTelemetryConfig {
  readonly serviceName?: string;
  readonly enabled?: boolean;
  readonly metricsPort?: number;
}

/** Span processor type as accepted by the installed NodeSDK version. */
type SpanProcessor = NonNullable<NodeSDKConfiguration['spanProcessors']>[number];

let sdk: NodeSDK | undefined;

/**
 * Standard OpenTelemetry environment variables that indicate the operator configured
 * trace export. When any is present the NodeSDK builds span processors from the
 * environment itself (OTLP by default, honoring OTEL_TRACES_EXPORTER=otlp|console|zipkin|none
 * and OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_TRACES_ENDPOINT).
 */
const TRACE_EXPORT_ENV_VARS = [
  'OTEL_TRACES_EXPORTER',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
] as const;

/** Returns true when the operator configured trace export through standard OTel env vars. */
function isTraceExportConfiguredViaEnv(): boolean {
  return TRACE_EXPORT_ENV_VARS.some((name) => {
    const value = process.env[name]?.trim();
    return value !== undefined && value.length > 0;
  });
}

/**
 * Builds a span processor that records nothing. Used when no trace export destination is
 * configured so a tracer provider is still registered (trace ids keep flowing into logs and
 * propagation headers) without the default OTLP exporter spamming connection errors against
 * a collector that does not exist. Production deployments are expected to set
 * OTEL_EXPORTER_OTLP_ENDPOINT (or OTEL_TRACES_EXPORTER) so real export takes over.
 */
function createNoopSpanProcessor(): SpanProcessor {
  return {
    forceFlush: async (): Promise<void> => {},
    onStart: (): void => {},
    onEnd: (): void => {},
    shutdown: async (): Promise<void> => {},
  };
}

/**
 * Resolves span processors for the NodeSDK.
 * Returns undefined when trace export is configured via standard OTel environment variables,
 * which delegates exporter construction to the NodeSDK's own env-driven setup; otherwise
 * returns a no-op processor so no export is attempted.
 */
function resolveSpanProcessors(): readonly SpanProcessor[] | undefined {
  if (isTraceExportConfiguredViaEnv()) {
    return undefined;
  }

  return [createNoopSpanProcessor()];
}

/**
 * Initializes OpenTelemetry SDK with auto-instrumentation, Prometheus metrics export, and
 * env-gated trace export. Should be called before any application code is loaded.
 *
 * Metrics: the Prometheus exporter is passed to the NodeSDK as a metric reader, so the SDK
 * registers the global MeterProvider and wires it into the auto-instrumentations. Everything
 * recorded via `@opentelemetry/api` metrics is served at `http://0.0.0.0:<metricsPort>/metrics`.
 *
 * Traces: when OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_TRACES_ENDPOINT /
 * OTEL_TRACES_EXPORTER is set, the NodeSDK builds exporters from those standard variables
 * (OTLP by default). Without them, spans are processed by a no-op processor (no export).
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

  // Configure Prometheus exporter for metrics (pull-based). The exporter is a MetricReader,
  // so passing it to the NodeSDK below is what makes the /metrics endpoint serve real data.
  const prometheusExporter = new PrometheusExporter({
    port: metricsPort,
  });

  const spanProcessors = resolveSpanProcessors();
  const traceExportMode = spanProcessors === undefined ? 'env (otlp default)' : 'noop (no export)';

  sdk = new NodeSDK({
    serviceName,
    // Registers the global MeterProvider with this reader and propagates it to instrumentations.
    metricReaders: [prometheusExporter],
    ...(spanProcessors === undefined ? {} : { spanProcessors: [...spanProcessors] }),
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
    traceExportMode,
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
