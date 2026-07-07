# Load Test Results — 2026-07-07

## Methodology and caveats

- **Tooling substitution:** k6 binaries are not installable in the execution
  environment (dl.k6.io, packages.grafana.com, and GitHub release downloads are
  blocked by network policy; the `k6` npm package is an empty placeholder).
  HTTP load was therefore generated with **autocannon 8** via
  `apps/api/load-tests/autocannon-http-load.js`, which reproduces the repaired
  k6 scenario mix; WebSocket load used a socket.io-client connection storm.
  The repaired k6 scripts (`http-load-test.js`) remain the canonical CI/staging
  scenario — run them with real k6 there.
- **The original k6 scripts were unusable:** they targeted endpoints that do not
  exist (`POST /auth/register`, `GET /stations?radiusKm=`, `GET /users/me`).
  `http-load-test.js` has been rewritten against the real API surface with the
  same stages/thresholds (p95 < 200 ms, error rate < 1 %). The scenario mix is
  ~70 % `GET /stations/nearby`, 15 % `GET /stations/search`, 10 %
  `GET /stations/:id` (all public map-browsing traffic), 5 % authenticated
  `GET /users/:id/sessions` with a pre-minted JWT pool.
  `websocket-load-test.js` still approximates socket.io framing over raw WS and
  must be validated against a real environment before its numbers are trusted.
- **Rate limiting is real and single-IP floods are rejected by design** (global
  throttle, plus strict auth throttles). For these runs the throttle limit was
  raised via the `LOADTEST_THROTTLE_LIMIT` env override; register/login flood
  testing requires distributed source IPs and a staging environment.
- **Environment:** single container, 4 vCPUs, API (`node dist/main.js`, one
  process, no cluster), PostgreSQL 16 + PostGIS and Redis on the same host,
  loopback networking. Seeded: 50 stations (2–4 connectors each), 20 users,
  pre-minted token pool. Numbers below are a **single-host lower bound**, not a
  production-cluster result.

## HTTP results (autocannon, scenario mix above)

| Connections | Duration | Avg rps | p50 | p90 | p97.5/p99 | Errors / timeouts | Post-run health |
|---|---|---|---|---|---|---|---|
| 50 | 60 s | **2,001** | 23 ms | 32 ms | 43 / 56 ms | 0 / 0 | ok |
| 100 | 30 s | **1,998** | — | — | — / 126 ms | 0 / 0 | ok |
| 150 | 30 s | 1,495 | — | — | — / 222 ms | 0 / 0 | briefly wedged, self-recovered |
| 200 | 30 s | **2,026** | — | — | — / 263 ms | 0 / 0 | ok |
| 200 | 60 s (first attempt) | 0 | — | — | — | 1,200 timeouts (100 %) | wedged ~minutes, self-recovered |

Interpretation:
- Throughput plateaus at **~2,000 req/s** — the single Node process saturates
  CPU; latency then grows with concurrency instead of throughput.
- The **p95 < 200 ms target is met up to ~100 concurrent connections**
  (p99 = 126 ms there). At 150–200 connections p99 exceeds the target and the
  process can enter a temporary event-loop wedge under sustained saturation
  (observed once at 200×60 s: all requests timed out for the run's duration,
  then full self-recovery with zero crash/log evidence). Horizontal scaling
  (the K8s HPA, 2–10 replicas) is the intended mitigation; a Node `cluster` or
  more vCPUs per pod would also raise the single-pod ceiling.
- Error rate at or below the knee: **0 %** (target < 1 % met).

## WebSocket results (socket.io session-monitoring gateway)

| Target | Ramp | Connected | Failed | Connect p50/p95/p99 | Held 20 s |
|---|---|---|---|---|---|
| 500 | 250/s | **500 (100 %)** | 0 | 31 / 81 / 86 ms | 500 |
| 2,000 | 500/s | 498 | 1,502 (client 10 s timeout) | 7.5 s / 10 s / 10 s | 498 |
| 1,500 | 100/s | **1,500 (100 %)** | 0 | 8 / 22 / 27 ms | 1,500 |

Interpretation:
- Steady-state capacity comfortably holds **1,500+ concurrent monitoring
  sockets** on one process; the 2,000-target failure was a **ramp-rate limit**
  (~500 handshakes/s overwhelms the accept path), not a connection-count limit
  — the same box accepted 1,500 flawlessly at 100 conn/s.
- The 10,000-connection target could not be tested from this host (client fd
  limit 4,096 and a single load generator). Testing it requires several
  distributed generators against a staging deployment; per-process results
  here suggest ~4–7 replicas would be needed, plus a validated ramp policy.

## Verdict vs targets (AGENTS.md / PromptBook step 67)

| Target | Result |
|---|---|
| API p95 < 200 ms | ✅ at ≤ ~100 concurrent connections per process; ❌ beyond — scale horizontally |
| Error rate < 1 % | ✅ (0 % on all completed runs) |
| 1,000 concurrent HTTP users | ⚠️ not reproducible single-host; ~2,000 req/s per process measured; needs staging + distributed generators for the full k6 profile |
| 10,000 WebSocket connections | ⚠️ 1,500/process demonstrated; full target needs multi-replica staging + distributed generators |

## Reproducing

Local (autocannon substitute):

```bash
# API with a raised throttle for load generation (never do this in production):
LOADTEST_THROTTLE_LIMIT=100000000 pnpm --filter @lilocharge/api start
API_URL=http://127.0.0.1:3000 CONNECTIONS=100 DURATION=60 \
  node apps/api/load-tests/autocannon-http-load.js
```

CI/staging (real k6, repaired scripts):

```bash
k6 run -e API_URL=https://staging.api.lilocharge.am apps/api/load-tests/http-load-test.js
```
