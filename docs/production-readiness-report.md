# LiloCharge — Production Readiness Report

Generated: 2026-02-21
Steps completed: 1–7 of PromptBook-LiloCharge-QA-Polish.md

## Executive Summary

LiloCharge is **not yet production-ready**. The biggest blocker is that **every API endpoint is unauthenticated** — no auth guards exist on any controller, meaning user data, payment operations, and session management are fully exposed. Beyond authentication, Redis cache invalidation has a staleness gap for nearby-station queries, and OCPP WebSocket connections accept any identity without credential verification. Estimated remaining effort to reach a secure soft-launch state is **3–4 weeks**, dominated by wiring authentication guards and OCPP security.

## Priority Classification

### P0 — Critical (Must Fix Before Launch)

| #   | Issue                                               | Affected File(s)                                                                                                                                                                                                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                 | Est. Effort |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **All API endpoints unauthenticated**               | `apps/api/src/stations/stations.controller.ts`, `apps/api/src/users/users.controller.ts`, `apps/api/src/sessions/sessions.controller.ts`, `apps/api/src/payments/payments.controller.ts`, `apps/api/src/wallet/wallet.controller.ts`, and 8 other controllers | Zero `@UseGuards` decorators exist anywhere in the codebase. Every endpoint (user profiles, sessions, payments, wallet top-ups, connector status mutations) is publicly accessible without authentication. The `AuthModule` registers `JwtModule` but exports no guard. Additionally, user-scoped endpoints accept `:userId` as a path param with only UUID format validation — creating IDOR risk even once auth is added. | 5–7 days    |
| 2   | **Redis cache invalidation gap on nearby-stations** | `apps/api/src/redis/cache.service.ts:97-101`, `apps/api/src/stations/stations.service.ts:117-141`                                                                                                                                                             | When a connector status changes, `invalidateStation(stationId)` clears only the `station:detail:{id}` cache key. It does NOT bust any `station:nearby:*` cache entries that include this station. The nearby cache TTL is 5 minutes (`STATION_CACHE_TTL_SECONDS = 300`). Users within the query radius may see stale availability for up to 5 minutes after a connector status change.                                      | 1–2 days    |
| 3   | **No rate limiting on any endpoint**                | `apps/api/src/app.module.ts`                                                                                                                                                                                                                                  | `ThrottlerModule` is not imported. No `@Throttle` or `ThrottlerGuard` exists in the application. The unauthenticated OTP endpoint (`POST /auth/otp/request`) is trivially abusable for SMS flooding/cost attacks. Ingress-level rate limiting (100 req/s global) exists in K8s but provides no per-endpoint or per-user protection.                                                                                         | 1–2 days    |

### P1 — High Priority (Fix Within First Sprint Post-Launch)

| #   | Issue                                      | Affected File(s)                                                                             | Description                                                                                                                                                                                                                                                                                                                           | Est. Effort |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **User location permission not wired**     | `apps/mobile/src/features/stations/stations-screen.tsx:45-49`                                | `DEFAULT_NEARBY_STATIONS_QUERY` hardcodes Yerevan center coordinates (`40.1792, 44.4991`). When the user grants location permission, the map should center on their actual GPS position and re-query nearby stations. Currently no `expo-location` integration exists — the map always defaults to central Yerevan.                   | 1–2 days    |
| 2   | **Composite connector index missing**      | `apps/api/prisma/schema.prisma:203-223`                                                      | No `@@index([stationId, powerKw])` exists on the `Connector` model. The nearby-stations query uses correlated subqueries (`SELECT COUNT(*)`, `SELECT MAX(power_kw)`) filtering by `station_id`. Without a composite index, these subqueries perform sequential scans on the connectors table for every station row in the result set. | 1 hour      |
| 3   | **OCPP WebSocket accepts any identity**    | `apps/api/src/ocpp/ocpp.server.service.ts:71-86`, `apps/api/src/ocpp/ocpp.server.factory.ts` | The OCPP auth callback only checks for non-empty identity string. No password/credential check, no client TLS certificate verification (mTLS), no database whitelist lookup. Any WebSocket client providing any string can impersonate any charge point and mutate connector statuses. Server runs on plain `ws://` — no TLS.         | 3–5 days    |
| 4   | **OCPP 2.0.1 routing not implemented**     | `apps/api/src/ocpp/ocpp.constants.ts:8`, `apps/api/src/ocpp/ocpp.routing.service.ts`         | `OCPP_PROTOCOLS` is `['ocpp1.6']` only. Type definitions for OCPP 2.0.1 exist in `packages/shared-types/src/ocpp2.ts` (covering `BootNotification`, `StatusNotification`, `TransactionEvent`, `MeterValues`) but no routing handler consumes them. 2.0.1 support is needed for next-generation hardware.                              | 6–8 weeks   |
| 5   | **OCPP WebSocket port not exposed in K8s** | `infrastructure/k8s/`                                                                        | The K8s Deployment only exposes port 3000 (HTTP) and 9464 (metrics). The OCPP WebSocket server on port 9220 has no dedicated Service or Ingress entry, making charge points unable to connect in production.                                                                                                                          | 2–4 hours   |

### P2 — Medium Priority (Backlog)

| #   | Issue                                         | Affected File(s)                                                                                                                             | Description                                                                                                                                                                                                                                                                                             | Est. Effort |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **Filter panel maxHeight hardcoded**          | `apps/mobile/src/features/stations/stations-screen.tsx:421-424`                                                                              | `outputRange: [0, 500]` is hardcoded in the `Animated.View` interpolation for the filter panel. If `StationFilters` content grows (e.g., more operators, new filter sections), this clips the panel. Use `onLayout` to measure actual content height.                                                   | 2–3 hours   |
| 2   | **Cluster layers missing power tier info**    | `apps/mobile/src/features/stations/stations-screen.tsx:460-476`                                                                              | When stations are clustered at low zoom levels, the cluster circle shows only the station count. Consider showing HPC count or highest power tier in the cluster label to help users identify fast-charging clusters.                                                                                   | 1–2 days    |
| 3   | **Missing OpenAPI @ApiQuery decorators**      | `apps/api/src/stations/stations.controller.ts:36-42`                                                                                         | The `getStationDetail` endpoint accepts `connectorTypes` and `minimumPowerKw` via `StationDetailQueryDto` but has no `@ApiQuery` decorators. Swagger UI will not document these query parameters. Same applies to the `findNearbyStations` endpoint's optional filter parameters.                       | 2–3 hours   |
| 4   | **No ADR for aggregate status priority rule** | `docs/adr/` (directory does not exist)                                                                                                       | The `AVAILABLE > OCCUPIED > MAINTENANCE > OFFLINE` priority rule is a product decision implemented in `packages/shared-types/src/station.ts` and `apps/api/src/stations/stations.queries.ts`. It should be documented as an Architecture Decision Record so future developers understand the rationale. | 1 hour      |
| 5   | **App Store / Play Store prep not started**   | —                                                                                                                                            | Bundle ID, provisioning profiles, store listings, privacy policy (exists in `docs/privacy-policy/` but needs legal review), screenshots, and review notes for Armenian App Store and Play Store submissions.                                                                                            | 3–5 days    |
| 6   | **No general .env.example file**              | `apps/api/`                                                                                                                                  | Only `apps/api/.env.sandbox.example` exists covering payment sandbox vars. No general `.env.example` documenting core variables (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OCPP_WS_PORT`, `MAPBOX_TOKEN`, etc.) exists. New developers must read source to discover required environment variables.   | 1–2 hours   |
| 7   | **E2E tests require running database**        | `apps/api/src/sessions/*.e2e.spec.ts`, `apps/api/src/auth/auth-registration.e2e.spec.ts`, `apps/api/src/ocpp/ocpp-compatibility.e2e.spec.ts` | 5 E2E test suites (47 tests) fail because they require a running PostgreSQL instance. These tests should either use a test container or be separated into a dedicated E2E test script that assumes infrastructure is running.                                                                           | 2–4 hours   |

## Test Suite Summary

Test run performed on 2026-02-21 (database not running — E2E failures are infrastructure-dependent):

| Package              | Suites Passed | Suites Failed | Tests Passed | Tests Failed | Total Tests |
| -------------------- | ------------- | ------------- | ------------ | ------------ | ----------- |
| `@lilocharge/mobile` | 42            | 0             | 280          | 0            | 280         |
| `@lilocharge/api`    | 67            | 5             | 459          | 47           | 506         |
| **Total**            | **109**       | **5**         | **739**      | **47**       | **786**     |

**Notes:**

- All 5 failing API suites are E2E tests requiring a live PostgreSQL connection (`PrismaClientInitializationError`): `ocpp-compatibility.e2e.spec.ts`, `multi-operator-sessions.e2e.spec.ts`, `session-monitoring.e2e.spec.ts`, `session-stop-receipt.e2e.spec.ts`, `auth-registration.e2e.spec.ts`
- All 739 unit and integration tests pass (100% pass rate for non-infrastructure-dependent tests)
- `@lilocharge/shared-types` and `@lilocharge/shared-utils` have no test suites yet (echo stubs only)
- Coverage data was not generated because turbo passthrough does not aggregate Jest coverage across workspaces

## Security Checklist

- [ ] All API endpoints require authentication — **FAIL**: Zero auth guards exist on any controller. Sessions, payments, wallet, user profile, and connector mutation endpoints are all publicly accessible.
- [ ] OCPP WebSocket connections require station certificate verification — **FAIL**: Auth callback accepts any non-empty identity string. No mTLS, no credential check, no whitelist. Server runs on plain `ws://`.
- [x] No secrets in source code — **PASS**: All sensitive values read from `process.env`. The `apps/api/.env.sandbox.example` contains only placeholder stubs (`sandbox-api-key-placeholder`).
- [ ] Rate limiting applied to public station endpoints — **FAIL**: No `ThrottlerModule` imported. No `@Throttle` decorators anywhere. Only ingress-level 100 req/s global blanket in K8s.
- [x] Input validation on all DTO fields — **PASS**: All station DTOs have thorough `class-validator` decorators with range constraints. Minor gap: `operatorIds` uses `@IsString` instead of `@IsUUID`. All other DTOs across the codebase use proper validation.

## Infrastructure Checklist

- [ ] Docker Compose production file configured — **N/A**: Production deployment uses Kubernetes exclusively. `infrastructure/docker/docker-compose.yml` is development-only.
- [x] Redis persistence (AOF or RDB) configured — **PASS**: Docker Compose runs `--appendonly yes`. K8s StatefulSet runs AOF + RDB with explicit save policies and password authentication. Backed by PersistentVolumeClaims (5Gi base / 10Gi production).
- [x] PostgreSQL backups configured (daily minimum) — **PASS**: K8s CronJob runs daily at 22:00 UTC with `pg_dump`, gzip compression, and 30-day retention on a 50Gi PVC. **Gap**: No offsite/cloud backup copy (S3/GCS).
- [x] PostGIS extension enabled in production DB — **PASS**: Init SQL (`infrastructure/docker/postgres/init/01-extensions.sql`) creates `postgis`, `timescaledb`, and `pg_trgm` extensions. Image is `timescale/timescaledb-ha:pg16` which bundles all three.
- [x] TimescaleDB hypertable for session metrics configured — **PASS**: Migration `20260217160500_add_session_meter_values_timeseries` creates hypertable on `meter_values` with 1-day chunk interval, continuous aggregates (1m + 1h), and retention policies (90d raw / 365d 1m / 730d 1h).
- [ ] Environment variables documented in .env.example — **PARTIAL**: Only `apps/api/.env.sandbox.example` exists for payment sandbox variables. No general `.env.example` covering `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OCPP_WS_PORT`, `MAPBOX_TOKEN`, `FCM_SERVER_KEY`, etc.

## Recommended Launch Sequence

1. **Fix P0 issues** — Add auth guards to all controllers, implement Redis nearby-cache invalidation, add ThrottlerModule rate limiting (estimated: 7–10 days)
2. **Fix P1 items 1–3** — Wire user location permission, add composite connector index, secure OCPP WebSocket auth (estimated: 5–8 days)
3. **Fix P1 item 5** — Add K8s Service/Ingress for OCPP WebSocket port 9220 (estimated: 2–4 hours)
4. **Load test** with k6 or Artillery — Target: 100 concurrent users, nearby-stations endpoint < 200ms p95, OCPP WebSocket < 50ms message roundtrip
5. **Soft launch** to 50 beta users via TestFlight (iOS) + Google Play Internal Testing (Android)
6. **Fix beta issues** and complete P2 items as prioritized
7. **Public launch** — Armenian App Store + Google Play Store

## Appendix: Files Changed in Steps 1–7

### Step 1 — API Contract Sync Audit

- `packages/shared-types/src/station.ts` — Added `connectorTypes` and `minimumPowerKw` to `StationDetailQueryRequest`
- `apps/api/src/stations/dto/station-detail-query.dto.ts` — Added matching DTO fields with validators and `parseStringArrayFilter` transform
- `apps/mobile/src/features/stations/stations-api.ts` — Replaced spread with explicit field serialization using `serializeQueryArray`
- `apps/mobile/src/features/stations/stations-screen.tsx` — Forwards filter params to `getStationDetail`; updated useEffect deps
- `apps/api/src/stations/stations.controller.spec.ts` — Updated test to use `StationDetailQueryDto`

### Step 2 — Test Suite Fixing

- `apps/mobile/src/features/stations/__tests__/stations-screen.spec.tsx` — Fixed stale `limit: 200` → `100`; added loading/error/empty state tests
- `apps/mobile/src/features/stations/__tests__/station-discovery.integration.spec.tsx` — Fixed limit values; added missing filter fields to expected queries
- `apps/mobile/src/features/stations/__tests__/station-bottom-sheet.spec.tsx` — Added empty-state test for no connectors/reviews
- `apps/mobile/src/features/stations/stations-screen.tsx` — Added `testID` attributes to loading and error text elements

### Step 3 — Station Aggregate Status Fix

- `packages/shared-types/src/station.ts` — Added `STATION_STATUS_PRIORITY` and `computeAggregateStationStatus()`
- `packages/shared-types/src/index.ts` — Barrel-exported new aggregate status utilities
- `apps/api/src/stations/stations.queries.ts` — Added `AGGREGATE_STATUS_SQL` fragment; replaced flat `s."status"` with computed aggregate in all query builders
- `apps/api/src/connectors/connectors.service.ts` — Added `cascadeStationAggregateStatus()` method; called after connector status changes

### Step 4 — Filter-Aware Connector Display

- `apps/api/src/stations/stations.queries.ts` — Added `StationDetailSqlParams` filter fields; `buildDetailConnectorFilterSql()` helper; injected filters into lateral joins
- `apps/api/src/stations/stations.service.ts` — Cache bypass when connector filters are active
- `apps/mobile/src/features/stations/station-bottom-sheet.tsx` — Added `hasActiveConnectorFilters` prop; "Filtered" badge
- `apps/mobile/src/features/stations/stations-screen.tsx` — Derives and passes `hasActiveConnectorFilters` to bottom sheet
- `apps/mobile/src/i18n/locales/en.json`, `hy.json`, `ru.json` — Added `filteredLabel` translation

### Step 5 — Map Pin Visual Enhancement

- `packages/shared-types/src/station.ts` — Added `PowerTier` type, `derivePowerTier()`, `connectorCount`/`maxPowerKw` fields
- `packages/shared-types/src/index.ts` — Barrel-exported `PowerTier` and `derivePowerTier`
- `apps/api/src/stations/stations.queries.ts` — Added `connectorCount` and `maxPowerKw` SQL subqueries
- `apps/mobile/src/features/stations/map/station-map.utils.ts` — Added `powerTier` to feature properties; `buildConnectorCountTextExpression()`
- `apps/mobile/src/features/stations/stations-screen.tsx` — 3-layer map pin stack (status circle, power tier badge, connector count)
- `apps/mobile/src/features/stations/station-marker.tsx` — Updated marker with power tier and connector count display
- 7 test files — Updated mock data with `connectorCount` and `maxPowerKw`

### Step 6 — Collapsible Filter Panel

- `apps/mobile/src/utils/is-jest-runtime.ts` — Created Jest runtime detection utility
- `apps/mobile/src/features/stations/stations-screen.tsx` — Collapsible filter panel with Animated height/opacity; toggle button with active-filter dot
- `apps/mobile/src/features/stations/station-filters.tsx` — Exported `hasAnyActiveFilters`
- `apps/mobile/src/i18n/locales/en.json`, `hy.json`, `ru.json` — Added toggle/toggleHide labels

### Step 7 — Integration Test Suite

- `apps/mobile/src/features/stations/__tests__/station-aggregate-status.integration.spec.tsx` — Created: 13 integration tests (A1-A4)
- `apps/api/src/stations/stations.queries.spec.ts` — Added 12 tests (B1-B3) for connector count, maxPowerKw, status filter
- `apps/api/src/connectors/connectors.service.spec.ts` — Added 6 tests for `cascadeStationAggregateStatus`
- `apps/api/src/stations/stations.controller.integration.spec.ts` — Created: 6 controller integration tests (C1-C6)
- `apps/mobile/src/features/stations/map/station-map.utils.spec.ts` — Fixed pre-existing assertion with new feature properties
