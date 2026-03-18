# LiloCharge Grafana Dashboards

This directory contains Grafana dashboard configurations for monitoring LiloCharge API.

## Dashboards

### lilocharge-api-dashboard.json

Main API monitoring dashboard showing:

- HTTP request rate and latency (P95)
- Error rates (4xx and 5xx)
- Active charging sessions
- Available connectors
- Node.js memory usage

## Setup

### Local Development

1. Start Prometheus and Grafana:

```bash
docker-compose up -d prometheus grafana
```

2. Access Grafana at http://localhost:3001
   - Default credentials: admin/admin

3. Add Prometheus data source:
   - URL: http://prometheus:9090
   - Access: Server (default)

4. Import dashboard:
   - Go to Dashboards → Import
   - Upload `lilocharge-api-dashboard.json`
   - Select Prometheus data source

### Production

Deploy using the Kubernetes manifests in `/infrastructure/k8s`:

```bash
kubectl apply -f infrastructure/k8s/prometheus.yaml
kubectl apply -f infrastructure/k8s/grafana.yaml
```

## Metrics Endpoint

The API exposes Prometheus metrics at:

- `http://localhost:9464/metrics` (OpenTelemetry metrics)

## Custom Metrics

Add custom business metrics in your services:

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('lilocharge-api');
const sessionCounter = meter.createCounter('charging_sessions_total', {
  description: 'Total number of charging sessions',
});

// Increment counter
sessionCounter.add(1, { status: 'completed' });
```
