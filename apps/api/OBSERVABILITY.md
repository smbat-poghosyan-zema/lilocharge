# Observability Setup - Step 48

## Overview

This step implements comprehensive observability for the LiloCharge API using:

- **Sentry** for error tracking and monitoring
- **Pino** for structured logging
- **OpenTelemetry** for distributed tracing and metrics
- **Grafana** dashboards for visualization

## What Was Implemented

### 1. Pino Logger Module (`/apps/api/src/observability/logger.module.ts`)

Structured logging service that:

- Replaces default NestJS logger with Pino
- Supports pretty-printing in development
- Provides structured JSON logging in production
- Implements NestJS LoggerService interface
- Configurable log levels via `LOG_LEVEL` environment variable

**Usage:**

```typescript
import { LoggerService } from './observability';

constructor(private readonly logger: LoggerService) {}

this.logger.log('User logged in', { userId: '123', email: 'user@example.com' });
this.logger.error('Payment failed', error.stack, { userId: '123', amount: 100 });
```

### 2. Sentry Error Tracking (`/apps/api/src/observability/sentry.module.ts`)

Automatic error capturing with:

- Environment-based configuration
- Sensitive data filtering (removes auth headers, cookies)
- User context support
- Custom error contexts
- Graceful degradation when DSN not configured

**Environment Variables:**

```bash
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ENABLED=true
SENTRY_TRACES_SAMPLE_RATE=0.1
APP_VERSION=1.0.0
```

**Usage:**

```typescript
import { SentryService } from './observability';

constructor(private readonly sentry: SentryService) {}

this.sentry.captureException(error, { userId: '123' });
this.sentry.setUser({ id: '123', email: 'user@example.com' });
```

### 3. OpenTelemetry Setup (`/apps/api/src/observability/opentelemetry.ts`)

Auto-instrumentation with:

- Prometheus metrics exporter (pull-based on port 9464)
- HTTP request tracing (ignores /health and /metrics endpoints)
- File system instrumentation disabled (reduces noise)
- Graceful shutdown on SIGTERM

**Environment Variables:**

```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=lilocharge-api
OTEL_METRICS_PORT=9464
```

**Metrics Endpoint:**

- `http://localhost:9464/metrics` - Prometheus-compatible metrics

### 4. HTTP Logging Interceptor (`/apps/api/src/observability/http-logging.interceptor.ts`)

Logs all HTTP requests/responses with:

- Request ID tracking (from `x-request-id` header or auto-generated)
- Request duration
- Status codes
- User agent
- Error details with stack traces

### 5. Grafana Dashboards (`/infrastructure/grafana/`)

Pre-configured dashboard (`lilocharge-api-dashboard.json`) with panels for:

- HTTP request rate (requests/sec)
- P95 response time
- Error rates (4xx and 5xx)
- Active charging sessions
- Available connectors
- Node.js memory usage

## Integration

The observability stack is integrated in `main.ts`:

1. **OpenTelemetry** - Initialized before app creation
2. **Pino Logger** - Replaces default NestJS logger
3. **HTTP Logging** - Added as global interceptor
4. **Sentry** - Initialized on module init via `SentryModule`

```typescript
// Initialize OpenTelemetry first (before app creation)
initializeOpenTelemetry();

const app = await NestFactory.create(...);

// Use Pino logger
const logger = app.get(LoggerService);
app.useLogger(logger);

// Add HTTP logging
app.useGlobalInterceptors(new HttpLoggingInterceptor(logger));
```

## Testing

All new code has comprehensive unit tests:

- `logger.service.spec.ts` - Logger functionality tests
- `sentry.service.spec.ts` - Sentry integration tests (with mocks)
- `http-logging.interceptor.spec.ts` - HTTP logging tests
- `opentelemetry.spec.ts` - OpenTelemetry initialization tests

**Test Coverage:**

- 371 tests passing
- 63 test suites
- All observability modules fully tested

## Environment Configuration

Add to `/apps/api/.env`:

```bash
# Observability
SENTRY_DSN=""
SENTRY_ENABLED="false"
SENTRY_TRACES_SAMPLE_RATE="0.1"
LOG_LEVEL="info"
OTEL_ENABLED="true"
OTEL_SERVICE_NAME="lilocharge-api"
OTEL_METRICS_PORT="9464"
```

## Production Setup

### 1. Sentry

1. Create a Sentry project at https://sentry.io
2. Get your DSN
3. Set environment variables:

```bash
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ENABLED=true
NODE_ENV=production
APP_VERSION=1.0.0
```

### 2. Prometheus + Grafana

Use the Kubernetes manifests in `/infrastructure/k8s`:

```bash
kubectl apply -f infrastructure/k8s/prometheus.yaml
kubectl apply -f infrastructure/k8s/grafana.yaml
```

Import the dashboard from `/infrastructure/grafana/lilocharge-api-dashboard.json`.

## Dependencies Added

```json
{
  "@sentry/node": "10.39.0",
  "pino": "10.3.1",
  "pino-http": "11.0.0",
  "pino-pretty": "13.1.3",
  "@opentelemetry/sdk-node": "0.212.0",
  "@opentelemetry/sdk-metrics": "2.5.1",
  "@opentelemetry/auto-instrumentations-node": "0.70.0",
  "@opentelemetry/exporter-prometheus": "0.212.0"
}
```

## Validation

All checks passed:

- ✅ TypeScript compilation (strict mode)
- ✅ ESLint (zero warnings)
- ✅ Jest tests (371 passing)
- ✅ Existing tests still pass
- ✅ No `any` types used
- ✅ All functions have JSDoc comments

## Next Steps

1. Configure Sentry DSN in production environment
2. Deploy Prometheus and Grafana to Kubernetes cluster
3. Import Grafana dashboard
4. Set up alerts for error rates and response times
5. Monitor metrics endpoint at `/metrics`
6. Review logs in production for structured logging format

## References

- [Pino Documentation](https://getpino.io/)
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [Grafana Dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
