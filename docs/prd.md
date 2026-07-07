# LiloCharge — Product Requirements Document (Current State)

**Date:** 2026-07-07
**Status:** Living document. This PRD describes the product as it exists on
this branch, verified against the codebase and test suites — not aspirational
claims. Evidence trail: [AUDIT-REPORT.md](../AUDIT-REPORT.md) (2026-07-02
audit), [BACKLOG.md](../BACKLOG.md) (remediation tasks, all P0/P1/P2 done),
[production-readiness-report.md](production-readiness-report.md),
[load-test-results.md](load-test-results.md).

## 1. Product vision

LiloCharge is an EV charging super-app for Armenia that aggregates every
public charging network in the country into a single, transparent, frictionless
mobile experience. Drivers get one map, one account, one payment method, and a
two-tap path from arriving at a charger to electrons flowing — regardless of
which operator owns the hardware. Operators get an OCPP-compliant central
system, community-verified status data, and a payment/settlement pipeline
without building their own consumer app. The product is Armenian-first
(hy/ru/en tri-lingual) and designed around local payment rails (ArCa, Idram)
with wallet support.

## 2. Personas

### Driver (primary)

An EV owner in Armenia who today juggles multiple operator apps, opaque
pricing, and unreliable availability data. Needs: find a working, available
charger nearby; start a charge in seconds (QR scan → confirm → charging); pay
with a local card, Idram, or a prepaid wallet; see live progress and get a
receipt; report problems and trust community status signals; use the app in
Armenian, Russian, or English; keep working (read-only) with a flaky
connection.

### Operator (secondary)

A charging network operator (9+ networks in Armenia) whose chargers speak
OCPP. Needs: connect chargers to LiloCharge's central system (OCPP 1.6-J or
2.0.1 core) with authenticated connections; have remote start/stop, metering,
and billing handled correctly (register-delta billing); receive problem
reports by email; import station inventory (Open Charge Map or CSV).

## 3. Feature inventory — current status

Legend: **Done** = implemented and covered by tests on this branch.
**Partial** = implemented with a documented, environment-dependent gap.
**Out of scope** = deliberately descoped; code fails loudly rather than faking.

| Feature                                                           | Status       | Notes                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Station discovery map (Mapbox, clustering, 3-layer pins, filters) | Done         | Real `@rnmapbox/maps` on native builds; PostGIS nearby/search APIs                                                                                                                          |
| Station detail + connector status                                 | Done         | `/stations/[id]` route, filter-aware connector display                                                                                                                                      |
| Real-time status + community confidence scores                    | Done         | Status broadcast over WS, confidence displayed in UI                                                                                                                                        |
| Two-tap QR charging flow                                          | Done         | Scan → confirm → live monitoring → summary; sessions API wired to OCPP remote start/stop                                                                                                    |
| Session history + PDF receipts                                    | Done         | Backend PDF generation, mobile history views                                                                                                                                                |
| Payments — ArCa & Idram server integration                        | Partial      | Webhooks with signature verification + idempotency keys implemented; **real gateway sandbox behavior unverified** (signature scheme is a documented adaptation point)                       |
| Payments — payment-method management UI                           | Done         | Card entry/tokenization, method list/removal                                                                                                                                                |
| Payments — Apple Pay / Google Pay                                 | Out of scope | Requires a configured token-exchange service; native Pay modules not built; backend fails loudly if unconfigured (no pseudo-token fallback)                                                 |
| Wallet (top-up, ledger, session debit)                            | Done         | Idempotent top-ups, wallet UI, wallet-path e2e                                                                                                                                              |
| Auth — phone OTP + JWT                                            | Partial      | Guards + throttling everywhere; SMS delivery is env-gated via a Twilio-compatible provider (needs production credentials); refresh-token rotation on mobile not implemented (401 signs out) |
| Community — reviews with photo upload                             | Done         | S3 presigned-URL upload path                                                                                                                                                                |
| Community — problem reports                                       | Done         | HTML-escaped operator emails                                                                                                                                                                |
| Community — crowdsourced status updates                           | Done         | With confidence display                                                                                                                                                                     |
| Push notifications                                                | Partial      | FCM adapter + runtime wiring complete; **real delivery needs Firebase credentials**                                                                                                         |
| Offline behavior                                                  | Partial      | Cache interceptor, offline banner, retry/backoff, socket reconnect; offline-session watchdog (auto-failing sessions on charger disconnect) still open                                       |
| Geolocation                                                       | Done         | `expo-location`; no hardcoded Yerevan anchor                                                                                                                                                |
| i18n (hy/ru/en) + in-app language switcher                        | Done         | Armenian-first; per-locale files under `apps/mobile/src/i18n/locales/{hy,ru,en}/common.json`                                                                                                |
| Favorites (local + server sync)                                   | Done         | MMKV-local with server-side sync                                                                                                                                                            |
| Station import (Open Charge Map, operator CSV)                    | Done         |                                                                                                                                                                                             |
| OCPP 1.6-J central system                                         | Done         | Full core profile, hardened — see §6                                                                                                                                                        |
| OCPP 2.0.1                                                        | Partial      | Core charging profile implemented — see §6 for exclusions                                                                                                                                   |
| Observability (Prometheus/OTel, Sentry)                           | Done         | MeterProvider registered; metrics endpoint emits real data                                                                                                                                  |
| Deployment (Docker Compose, K8s manifests)                        | Partial      | Manifests exist (incl. OCPP port 9220 service); **no real cluster rollout performed**                                                                                                       |
| Store assets (metadata, screenshots, privacy policy)              | Done         | Metadata validated by tests against store limits; privacy policy in hy/ru/en                                                                                                                |

## 4. Non-functional requirements

### Performance — targets vs. measured reality

Targets (from AGENTS.md): API p95 < 200 ms; mobile time-to-interactive < 2 s
on 3G. Measured (2026-07-07, single container, 4 vCPU, one Node process — see
[load-test-results.md](load-test-results.md) for full methodology and caveats):

- **~2,000 req/s** sustained per process on the real scenario mix
  (nearby/search/detail/sessions).
- **p95 < 200 ms met up to ~100 concurrent connections** (p99 = 126 ms at
  100); at 150–200 connections p99 exceeds target — horizontal scaling (K8s
  HPA 2–10 replicas) is the intended mitigation.
- **1,500 concurrent WebSocket connections held** on one process.
- The 1,000-VU / 10,000-WS headline targets require a distributed load test
  against a staging cluster — **not yet executed**.

### Security posture

- JWT auth guards on all non-public endpoints; per-endpoint throttling
  (strict on auth/OTP); helmet security headers; CORS whitelist.
- Payment webhooks verified by signature with idempotency keys; no raw card
  data stored (tokenization only); bcrypt (≥12 rounds).
- OCPP connections authenticated (`open`/`allowlist`/`basic` modes), wss
  supported; idTags are 20-char protocol-compliant tokens.
- Input validation via class-validator DTOs and Zod; HTML escaping in
  operator emails; no secrets in source (env-only).

### Reliability

- Redis-backed OCPP remote-start tracking and registry (HPA-safe).
- Register-delta billing (meterStop − meterStart is authoritative).
- Session concurrency guard (no second start on an occupied connector);
  zero-energy auto-refund.
- `/health` checks DB and Redis. Known gap: offline-session watchdog.

## 5. Architecture summary

**Stack:** React Native 0.74 + Expo SDK 51 (Expo Router) mobile; NestJS 10 on
Fastify backend; PostgreSQL 16 + PostGIS + TimescaleDB (Prisma 5, baseline
migrations included); Redis 7; Mapbox GL Native; `ocpp-rpc`; FCM;
react-i18next; pnpm + turborepo monorepo.

**Monorepo layout:**

```text
apps/api          NestJS backend (REST + Socket.IO + OCPP WS server)
apps/mobile       React Native Expo app (jest + Detox flows)
packages/shared-types   TypeScript contracts shared by api and mobile
infrastructure/docker   Dev and e2e-test compose stacks
infrastructure/k8s      Production manifests (HPA, OCPP service, backups)
scripts           Security scan / production validation tooling
docs              This PRD, deployment guide, reports, privacy policy
```

## 6. OCPP support matrix

| Capability                                  | OCPP 1.6-J                                       | OCPP 2.0.1                                         |
| ------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Subprotocol negotiation                     | Yes                                              | Yes (`ocpp1.6` + `ocpp2.0.1`)                      |
| BootNotification / Heartbeat                | Yes                                              | Yes                                                |
| StatusNotification                          | Yes                                              | Yes                                                |
| Authorize                                   | Yes                                              | Yes                                                |
| Transactions                                | StartTransaction / StopTransaction / MeterValues | TransactionEvent lifecycle (Started/Updated/Ended) |
| Remote start/stop                           | RemoteStart/StopTransaction                      | RequestStart/StopTransaction                       |
| Connection auth (open/allowlist/basic), wss | Yes                                              | Yes                                                |
| Reservations                                | No                                               | No                                                 |
| Smart charging                              | No                                               | No                                                 |
| Firmware / display management               | No                                               | No                                                 |
| Device model / security events              | —                                                | No                                                 |

Summary: **1.6-J full core profile; 2.0.1 core charging profile only** —
reservations, smart charging, firmware management, display management, device
model, and security events are explicitly not implemented. Validated against
protocol simulators in e2e; real charger hardware validation is pending (see
[ocpp-hardware-testing.md](ocpp-hardware-testing.md)).

## 7. Testing

- **API unit:** 84 jest suites (hermetic, no external services), run in CI
  with an enforced coverage floor.
- **API e2e:** 7 suites / 63 tests against a real Postgres+Redis stack
  (`infrastructure/docker/docker-compose.test.yml`, `pnpm test:e2e`); also run
  in CI via service containers.
- **Mobile:** 68 jest suites (jest-expo) with a coverage floor; a
  testID guard suite keeps Detox flows honest.
- **Mobile functional e2e:** Detox flows exist (`apps/mobile/e2e/flows`) but
  need emulator hardware — see `apps/mobile/e2e/README.md`.
- **Load:** executed 2026-07-07 — [load-test-results.md](load-test-results.md).

## 8. Open items

Environment-dependent work that cannot be closed from inside this repository:

1. Real ArCa/Idram (and Pay token-exchange) **sandbox validation**; webhook
   signature schemes are documented adaptation points.
2. **Native Apple Pay / Google Pay modules** (currently out of scope; backend
   fails loudly without a token-exchange service).
3. **FCM credentials** and a real device delivery test.
4. **OCPP hardware validation** on physical chargers.
5. **Distributed load test** at 1,000 VU / 10,000 WS against a staging
   cluster; real **K8s cluster rollout**.
6. Mobile **refresh-token rotation** and the **offline-session watchdog**.
