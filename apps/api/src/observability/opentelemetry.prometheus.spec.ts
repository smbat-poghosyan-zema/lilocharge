import { api } from '@opentelemetry/sdk-node';

import { initializeOpenTelemetry, shutdownOpenTelemetry } from './opentelemetry';

/**
 * Empirical integration test for the Prometheus metrics endpoint.
 *
 * Unlike opentelemetry.spec.ts (which mocks the SDK), this suite boots the real
 * OpenTelemetry NodeSDK + PrometheusExporter and scrapes the HTTP endpoint to prove
 * that instruments recorded through the global `@opentelemetry/api` meter actually
 * flow to the exporter — i.e. the MeterProvider really is registered globally.
 */
const METRICS_PORT = 19464;
const METRICS_URL = `http://127.0.0.1:${METRICS_PORT}/metrics`;
const SCRAPE_ATTEMPTS = 20;
const SCRAPE_RETRY_DELAY_MS = 250;

/** Scrapes the Prometheus endpoint, retrying briefly while the exporter server binds. */
async function scrapeMetricsEndpoint(): Promise<string> {
  let lastError: unknown = new Error('metrics endpoint never scraped');

  for (let attempt = 0; attempt < SCRAPE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(METRICS_URL);
      if (response.ok) {
        return await response.text();
      }
      lastError = new Error(`metrics endpoint returned HTTP ${response.status}`);
    } catch (error: unknown) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, SCRAPE_RETRY_DELAY_MS));
  }

  throw lastError;
}

describe('OpenTelemetry Prometheus endpoint (real SDK, no mocks)', () => {
  beforeAll(() => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    initializeOpenTelemetry({
      serviceName: 'prometheus-endpoint-spec',
      metricsPort: METRICS_PORT,
    });
    consoleSpy.mockRestore();
  }, 30000);

  afterAll(async () => {
    await shutdownOpenTelemetry();
  }, 30000);

  it('serves Prometheus text with resource target_info from the exporter port', async () => {
    const body = await scrapeMetricsEndpoint();

    // target_info carries the SDK resource attributes and is emitted by the exporter itself,
    // proving the reader is attached to a live MeterProvider.
    expect(body).toContain('target_info');
    expect(body).toContain('prometheus-endpoint-spec');
  }, 30000);

  it('exposes instruments recorded via the global @opentelemetry/api meter', async () => {
    // This is the exact path application code uses: the global meter provider. Before the
    // fix, the MeterProvider was constructed and discarded, so this counter would never
    // appear in the scrape output.
    const meter = api.metrics.getMeter('prometheus-endpoint-spec');
    const counter = meter.createCounter('observability_spec_probe', {
      description: 'Probe counter proving global meter registration',
    });
    counter.add(7, { probe: 'wallet-e2e' });

    const body = await scrapeMetricsEndpoint();

    expect(body).toContain('observability_spec_probe_total');
    expect(body).toMatch(/observability_spec_probe_total\{[^}]*probe="wallet-e2e"[^}]*\} 7/);
  }, 30000);
});
