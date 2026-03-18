# Load Testing Guide

This directory contains load tests for the LiloCharge API to validate performance under high concurrency.

## Overview

Two load test scenarios validate the system's ability to handle production-scale traffic:

1. **HTTP Load Test**: 1,000 concurrent sessions testing REST API endpoints
2. **WebSocket Load Test**: 10,000 concurrent WebSocket connections for real-time session monitoring

## Prerequisites

### Install k6

**macOS (Homebrew):**

```bash
brew install k6
```

**Linux (Debian/Ubuntu):**

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Other platforms:** See [k6 installation docs](https://k6.io/docs/getting-started/installation/)

### Start the API

Ensure the LiloCharge API is running:

```bash
cd apps/api
pnpm dev
```

The API should be accessible at `http://localhost:3000` and the health endpoint should return 200 OK:

```bash
curl http://localhost:3000/health
```

## Running Load Tests

### Quick Start

Run all load tests (HTTP + WebSocket):

```bash
cd apps/api/load-tests
./run-load-tests.sh all http://localhost:3000
```

### Individual Tests

Run only HTTP load test:

```bash
./run-load-tests.sh http http://localhost:3000
```

Run only WebSocket load test:

```bash
./run-load-tests.sh ws http://localhost:3000
```

### Custom API URL

Test against a different environment:

```bash
./run-load-tests.sh all https://api.staging.lilocharge.am
```

## Test Scenarios

### HTTP Load Test (`http-load-test.js`)

**Target:** 1,000 concurrent virtual users

**Duration:** ~7 minutes

**Stages:**

- 0→100 users (30s)
- 100→500 users (1m)
- 500→1,000 users (2m)
- Sustain 1,000 users (3m)
- 1,000→0 users (30s)

**User Scenarios:**
Each virtual user executes a realistic flow:

1. Register a new account
2. Login with credentials
3. Fetch nearby charging stations (Yerevan coordinates)
4. Get user profile
5. Health check

**Performance Thresholds:**

- ✅ P95 response time: <200ms (per AGENTS.md requirement)
- ✅ Error rate: <1%
- ✅ All endpoints return expected status codes and payloads

### WebSocket Load Test (`websocket-load-test.js`)

**Target:** 10,000 concurrent WebSocket connections

**Duration:** ~12 minutes

**Stages:**

- 0→1,000 connections (1m)
- 1,000→5,000 connections (2m)
- 5,000→10,000 connections (3m)
- Sustain 10,000 connections (5m)
- 10,000→0 connections (1m)

**User Scenarios:**
Each virtual user:

1. Establishes WebSocket connection
2. Subscribes to a session monitoring room
3. Maintains connection for 60 seconds
4. Receives real-time session updates
5. Unsubscribes and closes gracefully

**Performance Thresholds:**

- ✅ Connection error rate: <1%
- ✅ Message error rate: <1%
- ✅ P95 connection time: <500ms

## Results

Test results are saved in `./results/` with timestamps:

```
results/
├── http-20260218-001530.json      # Raw k6 metrics (JSON)
├── http-20260218-001530.txt       # Human-readable summary
├── ws-20260218-002145.json        # WebSocket metrics
└── ws-20260218-002145.txt         # WebSocket summary
```

### Interpreting Results

#### Key Metrics to Review

**HTTP Load Test:**

- `http_req_duration`: Response time distribution (check P95 < 200ms)
- `http_req_failed`: Percentage of failed requests (should be < 1%)
- `errors`: Custom error rate from failed checks
- `login_duration`: Login endpoint performance
- `station_list_duration`: Station query performance

**WebSocket Load Test:**

- `ws_connections_established`: Total successful connections
- `ws_messages_received`: Total messages delivered
- `ws_connection_errors`: Connection failure rate
- `ws_message_errors`: Message parsing/validation errors
- `ws_connection_duration`: Time to establish connection

#### Success Criteria

All tests must pass these criteria:

✅ **Zero critical failures** - All thresholds pass  
✅ **P95 < 200ms** - HTTP responses within target  
✅ **<1% error rate** - Both HTTP and WebSocket  
✅ **10K connections** - WebSocket scales to target  
✅ **Stable performance** - No degradation under sustained load

## Troubleshooting

### API Health Check Fails

```
❌ API health check failed at http://localhost:3000/health
```

**Solution:** Ensure the API is running:

```bash
cd apps/api
pnpm dev
```

### k6 Not Found

```
❌ k6 is not installed
```

**Solution:** Install k6 (see Prerequisites section above)

### High Error Rates

If you see error rates >1%, check:

1. **Database connection**: Ensure PostgreSQL is running
2. **Redis connection**: Ensure Redis is running
3. **Resource limits**: Check system memory and file descriptors
4. **Database performance**: Check for slow queries

```bash
# Increase file descriptor limits if needed (Linux/macOS)
ulimit -n 65536
```

### Connection Refused (WebSocket)

**Symptom:** WebSocket connections fail to establish

**Solution:** Verify WebSocket gateway is enabled in the API configuration

### Timeouts Under Load

**Symptom:** Tests timeout or P95 > 200ms consistently

**Possible causes:**

- Database connection pool exhausted
- Redis connection limits
- CPU/memory pressure
- Network latency

**Solutions:**

- Increase database connection pool size
- Scale Redis
- Profile slow endpoints
- Run tests closer to the API (reduce network latency)

## Advanced Usage

### Custom Test Parameters

You can modify test parameters by editing the JavaScript files:

**http-load-test.js:**

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 100 }, // Adjust ramp-up
    { duration: '3m', target: 1000 }, // Adjust target users
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // Adjust P95 target
  },
};
```

**websocket-load-test.js:**

```javascript
export const options = {
  stages: [
    { duration: '5m', target: 10000 }, // Adjust connection target
  ],
};
```

### Running with k6 Cloud

For distributed load testing from multiple regions:

```bash
k6 cloud apps/api/load-tests/http-load-test.js
```

(Requires k6 Cloud account)

### CI/CD Integration

Load tests can run in CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run Load Tests
  run: |
    cd apps/api/load-tests
    ./run-load-tests.sh all http://localhost:3000
```

## Performance Baselines

Expected performance on recommended hardware (8 CPU, 16GB RAM, SSD):

| Metric                 | Target | Typical   |
| ---------------------- | ------ | --------- |
| HTTP P95               | <200ms | 50-150ms  |
| HTTP P99               | <500ms | 100-250ms |
| WS Connections         | 10,000 | 10,000+   |
| WS Connection Time P95 | <500ms | 100-300ms |
| Error Rate             | <1%    | <0.1%     |

## References

- [k6 Documentation](https://k6.io/docs/)
- [k6 HTTP Module](https://k6.io/docs/javascript-api/k6-http/)
- [k6 WebSocket Module](https://k6.io/docs/javascript-api/k6-ws/)
- [LiloCharge AGENTS.md](../../../AGENTS.md) - Performance requirements
- [Socket.IO Load Testing](https://socket.io/docs/v4/load-testing/)
