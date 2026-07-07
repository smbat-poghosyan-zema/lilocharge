# LiloCharge — Codebase Audits

Two audit rounds live in this file: the **2026-07-07 re-audit** (current state, below)
and the original **2026-07-02 completeness audit** (historical baseline, further down —
kept verbatim; everything it classified NOT DONE / NEEDS REFACTORING has since been
implemented and independently re-verified).

---

# Re-Audit — 2026-07-07 (current state)

**Scope:** independent verification round after the full P0/P1/P2 backlog implementation
(~25 commits by parallel agent workstreams). Three fresh-eyes read-only audits: API deep
verification, mobile deep verification, and configuration/deployment coherence. "Done"
claims were spot-checked in code, not trusted.
**Companion:** [BACKLOG.md](BACKLOG.md) Round 2 — every NEEDS-ADJUSTMENT finding below
maps to a task there.

## Verdict in one paragraph

The backlog was genuinely executed, not just marked done — every P0/P1/P2 headline
(baseline migration, OCPP command wiring + hardening + 2.0.1 core, SMS OTP, signed
webhooks, idempotency, helmet/readiness, real Prometheus, charging/wallet/community UIs,
i18n 353/353/353 key parity, Detox flows, CI gates) was verified real, with high and
uniform code quality inside each module. The remaining defects cluster exactly where
parallel workstreams meet: the API-start and charger-start session worlds were each
finished but never joined, wallet/gateway settlement diverges per stop path, idempotency
persist-then-reuse was applied by one agent but not the others, and the deployment
config surface never learned about ~45 new env vars. **Ship-blockers exist in the money
path (R1–R4) and device readiness (R5–R7); all are small and well-localized relative to
the work already done.**

## Test/build state (verified 2026-07-07)

API: 84 unit suites / 678 tests + 7 e2e suites / 63 tests green (coverage floors
enforced: 85% statements). Mobile: 68 suites / 529 tests green (86% floor). tsc + eslint
clean everywhere; `prisma migrate deploy` verified against a fresh DB; load tests
executed (docs/load-test-results.md).

## A — DONE-VERIFIED (highlights; file:line evidence in the agent reports)

- Sessions API ↔ OCPP: RemoteStart before activation with 409 on offline/reject; stop
  computes real cost (no more 0-billing). Register-delta billing (`meterStop − meterStart`)
  authoritative on OCPP stops.
- OCPP: auth modes with fail-fast config + timing-safe compares; wss support; Redis-backed
  idTag (20-char protocol-conformant tokens) and remote-start tracking; Authorize in both
  protocols; **2.0.1 core profile real** (negotiation, TransactionEvent lifecycle,
  protocol-aware remote commands). idTag-TTL-vs-long-sessions is a non-issue (stop
  resolves by transactionId).
- Payments: HMAC webhooks (constant-time, forward-only transitions, replay-safe acks);
  capture/refund idempotency persisted-then-reused; wallet/gateway separation enforced;
  pseudo-token fallback removed (503 instead).
- Guard coverage complete: global JwtAuthGuard + Throttler; every user-scoped controller
  Idor-guarded; only justified `@Public` surfaces. Uploads SigV4 spot-checked correct.
- Mobile: every route reachable (no dead ends); QR flow coherent end-to-end including
  terminal-status redirects; all 10 API modules identically wired; caching is
  fallback-only (not wrong for volatile data); favorites sync sound; i18n parity perfect
  (353 keys × 3 locales, 1 unused key); Detox testIDs all real.
- Hygiene: 0 TODO/FIXME in product code; production casts down to 1 documented instance.

## B — NEEDS ADJUSTMENT (see BACKLOG.md Round 2 for the task list)

**Money path (ship-blockers):**
1. **API-started sessions and the charger's answering StartTransaction are never
   linked** — a second ACTIVE session is created; the API session never gets a
   transactionId (so stop skips RemoteStop → charger keeps delivering), meter values
   attach to the duplicate, the API session finalizes at 0 kWh → **pre-auth refunded
   while real charging happened**; the duplicate completes unbilled. The Redis
   correlation tracking built for this is write-only (zero production readers).
2. One-session-per-connector guard covers only the API creation path (1 of 3);
   zero-energy auto-refund and wallet settlement cover only the API stop path (1 of 3) —
   wallet-default users are never billed on charger-initiated stops.
3. Wallet balance writes are lost-update-prone (read→compute→set at default isolation);
   top-up and session pre-auth mint idempotency keys only after gateway success
   (retry double-charges); webhook can race the synchronous capture path.
4. Wallet stop ordering: session completes (and notifies) before the deduct — an
   insufficient balance at stop leaves a COMPLETED, unpaid session.

**Device readiness (mobile):**
5. Receipt download can never work (bare URL via Linking.openURL against a JWT-guarded
   endpoint → always 401). Monitoring socket connects to `http://localhost:3000` on
   devices (one-line fix; REST clients use `EXPO_PUBLIC_API_URL`, this one doesn't) —
   and the API-side monitoring gateway has no auth at all.
6. The persisted refresh token is never used and the session context never re-reads
   storage — every user silently breaks one hour after login until cold restart.
7. Push tokens register only at app launch (fresh-install login registers nothing until
   restart) and are never unregistered on logout; logout also leaves favorites and the
   previous user's cached API data (wallet balance, profile) in MMKV. Tokens sit in
   unencrypted MMKV. Onboarding's payment step is still inert (Pay bridges to
   nonexistent native modules; ARCA/IDRAM selections do nothing) and doesn't hand off
   to the real payment-methods flow.

**Deployment config (the K8s deployment as-written would):**
8. 500 every login (`REFRESH_TOKEN_SECRET` absent), 503 every payment callback (webhook
   secrets absent), silently skip OTP SMS (SMS vars absent → registration dead), send no
   pushes (injects legacy `FCM_SERVER_KEY`, never read; needs service-account vars),
   503 uploads, block browser clients (CORS_ORIGIN unset + double CORS layers).
9. OCPP port 9220 is unreachable from outside the cluster (no ingress route/LB, no
   session-affinity annotation, 60s proxy-read-timeout would drop WebSockets anyway).
   Migration job downloads unpinned latest prisma at runtime (v6 vs client v5).
   `backend.yml` deploy job uses `secrets.*` in a job-level `if` (workflow errors on main).
10. Mobile `app.json` is not release-buildable: no bundle ids, no permission plugins/
    strings for camera/photos/location/notifications, no Mapbox download token, no per-
    profile `EXPO_PUBLIC_*` env in `eas.json`.

**Cross-agent debt:** evseId candidate builder still ×3 (+hand-maintained inverse);
`resolveErrorMessage` ×16; mobile `formatDramAmount` ×3 and `normalizeRouteParam` ×6;
in-memory OCPP transaction-id allocation collides across replicas; wallet refund service
and several mobile helpers are exported-never-called; 2.0.1 string transaction ids can't
be remote-stopped.

## C — NICE-TO-HAVE (selection)

Presign content-type constraints; webhook 404→200 acks; `OCPP_AUTH_MODE=open` fail-fast
in production; OTP SMS localization (English-only today); FAILED session summary styled
as success; sign-in redirect loses the scanned connector; debug API-URL footer in
profile; HPA/resource tuning per measured load results; SMTP blocked by the 443-only
egress policy; dead-code sweep (image-optimization, performance-hooks, expo-status-bar).

---

# Original Completeness Audit — 2026-07-02 (historical baseline)

**Date:** 2026-07-02
**Scope:** Full monorepo (`apps/api`, `apps/mobile`, `packages/*`, `infrastructure/*`, `docs/*`) compared against the README feature list and the PromptBook build plan (the de-facto PRD — `docs/prd.md` referenced by README and AGENTS.md does not exist).
**Method:** Read-only code inspection (no code was modified), full test-suite execution (unit + API e2e against locally provisioned Postgres 16 + PostGIS and Redis 7), typecheck and lint runs. Every claim below cites file paths; nothing is taken from README/step-summary claims on trust.
**Companion document:** [BACKLOG.md](BACKLOG.md) — actionable tasks for every NOT DONE / NEEDS REFACTORING item.

---

## Executive summary

The **backend is substantially real**: ~74 spec suites, genuine PostGIS geo-search, TimescaleDB migrations, a working OCPP 1.6-J WebSocket server, real payment-gateway HTTP clients, FCM, SMTP, JWT+OTP auth with guards/throttling, and a session state machine with PDF receipts. Its unfinished seams are at the external boundaries: OTP SMS is never sent, payment webhooks/signature verification don't exist, the sessions API never commands a charger over OCPP, OCPP 2.0.1 is types-only, and there is **no baseline Prisma migration** (deploys to a fresh database fail).

The **mobile app implements onboarding, a station-discovery map, and local favorites — and nothing else from the feature list**. There is **no QR scanner, no charging-session UI, no receipts, no payment/wallet UI, no community write features, no push wiring**. Three systemic defects undermine even the working parts: the API base URL is hardcoded to `http://localhost:3000`, Metro unconditionally substitutes a mock for `@rnmapbox/maps` in every build, and auth tokens live only in React state (lost on restart).

**Headline verdict per README feature** (each feature appears in exactly one category; details in the sections referenced):

| # | README/PRD feature | Verdict | Where detailed |
|---|---|---|---|
| 1 | Universal Discovery (9+ operators) | **NEEDS REFACTORING** | §2.1 |
| 2 | Real-Time Status + confidence scores | **NEEDS REFACTORING** | §2.2 |
| 3 | Unified Payments (ArCa, Idram, Apple Pay, Google Pay) | **NOT DONE** | §3.1 |
| 4 | Two-Tap QR Charging | **NOT DONE** | §3.2 |
| 5 | Tri-Lingual i18n (hy/ru/en, Armenian-first) | **NEEDS REFACTORING** | §2.3 |
| 6 | Community Features (ratings, photos, problem reports) | **NOT DONE** | §3.3 |
| 7 | OCPP Integration — 1.6-J | **NEEDS REFACTORING** | §2.4 |
| 8 | OCPP Integration — 2.0.1 (README claims it) | **NOT DONE** | §3.4 |
| 9 | In-app wallet + top-up (PRD steps 44-45) | **NOT DONE** | §3.5 |
| 10 | Push notifications (PRD step 39) | **NOT DONE** | §3.6 |
| 11 | Auth (phone OTP + JWT, PRD step 8) | **NEEDS REFACTORING** | §2.5 |
| 12 | Session lifecycle + history + PDF receipts (steps 32-33, 40) — backend | **NEEDS REFACTORING** | §2.6 |
| 13 | Observability (step 48) | **NEEDS REFACTORING** | §2.7 |
| 14 | Production deployment — K8s/Docker (step 50) | **NEEDS REFACTORING** | §2.8 |
| 15 | Database schema & migrations (steps 4-6) | **NOT DONE** (no baseline migration) | §3.7 |
| 16 | Security hardening (P0-Security promptbook) | **DONE** (with P1 caveats) | §1 |
| 17 | Station data import — Open Charge Map + CSV (step 17) | **DONE** | §1 |
| 18 | QA-Polish items (aggregate status, filter-aware detail, map pins, filter panel) | **NEEDS REFACTORING** (typecheck regression) | §2.9 |

**Test suite (executed):** mobile 42/42 suites, 280/280 tests pass; API 69/74 suites pass without infra (475 pass / 47 fail — all 47 in the 5 e2e suites that need live Postgres/Redis); with live infra provisioned, 3 of the 5 e2e suites still fail for real reasons (test-vs-throttler conflict, cross-suite data pollution, missing cleanup). `pnpm typecheck` **fails in the API on production code**; mobile lint fails with 3 errors. No mobile functional E2E exists (Detox is screenshot-only and unrunnable). Details in §5.

---

## 1. DONE — fully implemented, tested, working as designed

All verdicts are for the code as designed; "DONE" does not imply the *product feature* is user-reachable if the mobile side is missing (those are captured separately).

### Backend modules (apps/api)

| Module | Evidence |
|---|---|
| **stations** (discovery API) | Real PostGIS `ST_DWithin`/`ST_Distance` nearby search with connector/power/status/operator filters (`src/stations/stations.queries.ts:60-97`), pg_trgm tri-lingual fuzzy search, aggregate availability computed from live connector statuses (`stations.queries.ts:15-31`), Redis caching (`stations.service.ts:118-211`). 6 spec files. *(One typecheck regression in this module is tracked in §2.9.)* |
| **station-import** | Real Open Charge Map HTTP client filtered to Armenia (`src/station-import/open-charge-map.client.ts:31-59`) + operator CSV importer, deterministic upserts, runnable scripts (`import:ocm`, `import:csv`). 3 specs. No per-operator live APIs — import-based by design. |
| **connectors** | Status updates (incl. OCPP-driven), pricing calculation, station aggregate-status cascade (`src/connectors/connectors.service.ts:74,111,143`). 2 specs. |
| **connector-status-updates** (confidence scores) | Crowdsourced status with confidence scoring from user reputation + recency (`src/connector-status-updates/connector-status-updates.service.ts:78-100`). 2 specs. |
| **favorites** | Full CRUD with IdorGuard (`src/favorites/favorites.controller.ts:26-43`). 2 specs. |
| **reviews** (API only) | CRUD with ownership checks, pagination, rating aggregation. 2 specs. *(Photo upload does not exist — see §3.3.)* |
| **problem-reports** (API only) | Create/list + operator email via MailService (`src/problem-reports/problem-reports.service.ts:85`). 2 specs. |
| **users**, **vehicles** | Profile/language/notification-prefs, vehicle CRUD, both Idor-guarded. 4 specs. |
| **redis** | Real node-redis client + TTL'd `CacheService` used by stations (`src/redis/redis.service.ts:13`); `invalidateStation` busts `station:detail:*`, `station:nearby:*`, `station:search:*` (P0-2 fix landed). 21 cache spec cases. |
| **notifications (backend)** | Real `firebase-admin` FCM multicast with invalid-token cleanup (`src/notifications/fcm-admin.client.ts:55-87`), localized template service, push-token endpoints. 4 specs. Env-gated no-op mode when unconfigured. |
| **common**, **ci**, **seed** | Global `HttpExceptionFilter`; CI workflow sanity specs; idempotent demo seed incl. generated meter-value series. |

### Security hardening (P0-Security promptbook) — verified landed

The 2026-02-21 readiness report's P0 findings ("zero guards, no throttler, single-key cache invalidation") are **no longer true**; the P0-Security promptbook was executed:

- Global `JwtAuthGuard` + `@Public()` decorator + `IdorGuard` on user-scoped controllers (`src/app.module.ts`, `src/auth/guards/jwt-auth.guard.ts`, `idor.guard.ts`), with specs (8 + 4 cases).
- `ThrottlerModule` global 100 req/min + per-endpoint `@Throttle` on all four auth endpoints (`src/auth/auth.controller.ts:23,31,41,49`). *(Side effect: it breaks one e2e test — §5.3.)*
- Refresh-token rotation with Redis-stored `jti`; refresh-as-access rejected (`src/auth/auth.service.ts:142-159,191-195`).

Remaining P1-level security gaps are listed under §2.4 (OCPP identity/wss) and §2.8 (no helmet).

### Mobile (apps/mobile)

| Item | Evidence |
|---|---|
| **Onboarding flow** (register → verify phone → vehicle → payment-choice screens) | Real calls to `/auth/otp/request`, `/auth/otp/verify`, `/auth/login`, `/users/:id/vehicles` (`src/features/onboarding/onboarding-api.ts:58-116`); screens tested (RTL). *(Payment step is inert — §3.1; session persistence missing — §2.10.)* |
| **Typed API client** | Interceptor-capable client with 401 handling and error wrapping (`src/api/api-client.ts:143-179`), 7 spec cases. |
| **Local favorites** | MMKV-backed favorites screen + storage, tested. *(Server sync unused — §2.10.)* |
| **i18n infrastructure** | hy/ru/en resource files (140/140/139 keys), Armenian default (`src/i18n/i18n.ts:15,19`), schema parity enforced via `typeof hyCommon`; 37-case Armenian rendering suite + 32-case language-switching suite. *(Feature-level verdict is NEEDS REFACTORING for the missing key + no switcher UI — §2.3.)* |

### Shared packages

- **shared-types**: 17 domain modules (auth…wallet, ocpp, ocpp2), string enums, `STATION_STATUS_PRIORITY`, `computeAggregateStationStatus()`, `derivePowerTier()` (`packages/shared-types/src/station.ts`). Builds clean. *(No tests — tracked in §5.)*

---

## 2. NEEDS REFACTORING — works, but with defects that block production or violate stated architecture

### 2.1 Universal Discovery (README #1)

Backend is DONE (§1). The mobile map/discovery UI is fully coded and well-tested (clustering, filters, debounced tri-lingual search, bottom sheet, 30s polling — `src/features/stations/stations-screen.tsx`), but three defects mean **no real device ever shows real data on a real map**:

1. **Metro ships the Mapbox mock in every build.** `metro.config.js:20-26` unconditionally rewrites `@rnmapbox/maps` → `src/__mocks__/rnmapbox-maps.js` with no platform check (comment says "for Expo Go / web"). On native, the mock renders placeholder Views; `offlineManagerLegacy.createPack` is a no-op that resolves successfully (`rnmapbox-maps.js:311-313`), so the **"Download offline map" button reports success without downloading anything**.
2. **Hardcoded fallback stations.** `FALLBACK_STATIONS` (`stations-screen.tsx:76-141`) — 4 fictional Yerevan stations rendered as initial state and whenever the API returns an empty unfiltered list, indistinguishable from real data.
3. **No geolocation.** `expo-location` is not a dependency; nearby/search queries are permanently anchored to Yerevan center 40.1792/44.4991 (`stations-screen.tsx:42-47`).

Also: tapping "View details" navigates to `/stations/[id]` (`stations-screen.tsx:392`) — **that route does not exist** under `app/`; dead-end navigation.

### 2.2 Real-Time Status + confidence scores (README #2)

- Backend: OCPP StatusNotification → connector update → station aggregate cascade → WS broadcast is complete and tested (`src/ocpp/ocpp.status-broadcast.service.ts`, `src/connectors/connectors.service.ts`). Confidence scoring service is DONE (§1).
- Mobile: displays aggregate status on pins/bottom sheet, but **consumes none of the real-time broadcast** (30-second HTTP polling instead), and **confidence scores appear nowhere in the mobile UI** — the concept exists only in `packages/shared-types/src/connector-status-update.ts`. The README's "community-driven confidence scores" are collected (API) but never shown to users, and no mobile UI exists to *submit* a status update either.

### 2.3 Tri-lingual i18n (README #5)

Infrastructure and tests are strong (§1), but:

- **Missing hy key**: `stations.map.filters.clear` is absent from `src/i18n/locales/hy/common.json` (en 140 / ru 140 / hy 139 keys). Since both `lng` and `fallbackLng` are `'hy'`, Armenian users see the raw key string on the filter Clear button (`station-filters.tsx:72`). Verified by direct key lookup.
- **No language switcher**: zero `changeLanguage` calls in non-test code; the profile screen (the natural home for it) is a stub. Users cannot change language in-app despite `PATCH /users/:id/language` existing on the backend.

### 2.4 OCPP 1.6-J (README #7)

Real `ocpp-rpc` WebSocket server (port 9220) handling BootNotification, Heartbeat, StatusNotification, MeterValues, StartTransaction, StopTransaction (`src/ocpp/ocpp.routing.service.ts:36-43`), RemoteStart/Stop services with retry/timeout, registry with disconnect handling, 10 spec files. Defects:

- **Remote commands are never called from outside the OCPP module** — the sessions API never commands a charger (see §2.6; this is the biggest single backend gap).
- **No `Authorize` handler** — chargers that authorize locally by idTag get `NotImplemented` (`ocpp.routing.service.ts:86`).
- **Security**: the connection auth callback accepts any non-empty identity; plain `ws://`, no credentials/mTLS (`src/ocpp/ocpp.server.service.ts:66-137`). Port 9220 is not exposed in any K8s manifest.
- **In-memory remote-start tracking** (`ocpp.remote-start.service.ts:70`) — lost on restart, unsafe with >1 replica (K8s HPA scales the API to 2–10 replicas, which also breaks a single-server OCPP registry).

### 2.5 Auth (PRD step 8)

OTP+JWT flows are real and guarded (§1), but **the OTP is never delivered**: no SMS provider exists anywhere in the repo (zero hits for sms/twilio/vonage/etc.); `requestPhoneOtp` stores the code in Redis and returns "OTP sent successfully" without sending it (`src/auth/auth.service.ts:54-72`). Phone registration is unusable outside dev (where the e2e test reads the OTP straight from Redis).

### 2.6 Sessions backend (PRD steps 32-33, 40)

State machine (PENDING→AUTHORIZED→ACTIVE→COMPLETED/FAILED/CANCELLED) with transition validation, wallet-vs-gateway payment branching, refund on failure, pdfkit receipts, Socket.IO live monitoring fed by OCPP MeterValues — all implemented and spec-covered (`src/sessions/sessions.service.ts:60-67,133-155,398-530`). Defects:

1. **`POST /users/:userId/sessions/:sessionId/start|stop` never sends OCPP RemoteStart/RemoteStop** — grep confirms zero references to the remote services from `src/sessions/*.ts` (non-spec). The app can mutate DB state but cannot actually start or stop a charger. The "QR-to-start" spec wires `SessionsService` and `OcppRemoteStartService` together *inside the test itself* (`sessions-qr-to-start.spec.ts`) — the production wiring does not exist.
2. **API-driven stop bills 0**: `stopSession` reads `completedSession.totalCost`, which only the OCPP StopTransaction path computes.
3. `'WALLET' as never` enum casts (`sessions.service.ts:322,363,380-381`) — shared-types/Prisma enum drift.

### 2.7 Observability (step 48)

Pino logging, HTTP interceptor, Sentry (DSN-gated) are real. But **Prometheus metrics are dead wiring**: a `MeterProvider` with the Prometheus reader is created and discarded — `void meterProvider; // unused but required for setup` (`src/observability/opentelemetry.ts:44-49`) — never registered globally nor passed to `NodeSDK`, while `main.ts:97` advertises a metrics endpoint. No trace exporter configured.

### 2.8 Deployment infrastructure (step 50)

18 K8s manifests, multi-stage Dockerfile, deploy/validation scripts exist and are internally consistent (unverifiable in a live cluster from this environment). Defects: the migration job runs `prisma migrate deploy` (`infrastructure/k8s/jobs/migration-job.yaml:46`) which **fails on a fresh database** (§3.7); OCPP port 9220 absent from manifests (§2.4); HPA 2–10 replicas is incompatible with in-memory OCPP state (§2.4); **no helmet/security headers** anywhere in the API (`src/main.ts`); health endpoint is liveness-only — static payload, no DB/Redis readiness probes (`src/health/health.controller.ts:13-21`).

### 2.9 QA-Polish items (aggregate status, filter-aware detail, map pins, filter panel)

All shipped and tested (aggregate-status SQL + cascade, filter-aware bottom sheet + badge + i18n, 3-layer pins, collapsible panel, `is-jest-runtime.ts`). **But a regression breaks the build**: `mapNearbyStationRawRowToResponse` (`src/stations/stations.service.ts:253-266`) omits `connectorCount` and `maxPowerKw`, which the SQL returns (`stations.queries.ts:83-84,121-122`) and `StationNearbyResponse` requires — **`pnpm typecheck` fails on production code** (2 errors: `stations.service.ts:254`, `stations.service.spec.ts:382`), and the nearby API response actually lacks the two fields the 3-layer map pins need. Jest passes because ts-jest doesn't enforce these diagnostics — so the suite is green while `tsc` is red.

### 2.10 Mobile cross-cutting (auth/session/caching plumbing)

- **API base URL permanently `http://localhost:3000`**: all five default clients call `resolveApiBaseUrl(undefined)` (`stations-api.ts:61`, `onboarding-api.ts:119`, `favorites-api.ts:32`, `notifications-api.ts:39`, `profile-screen.tsx:6`); no `EXPO_PUBLIC_API_URL` is ever read. On a real device every API call fails.
- **Auth never attached / never persisted**: the API client supports token interceptors but no default client passes them; tokens live in React state only (`onboarding-session.tsx:72`) — everything is lost on restart, and `isComplete` is not persisted, so **every cold start repeats onboarding** (`app/index.tsx`).
- **Response cache is dead code**: `src/api/cache-interceptor.ts` (complete MMKV cache, 17 spec cases) is never registered on any client.
- **Server favorites unused**: `favorites-api.ts` is never imported by a screen; favorites are local-only, never synced.
- Mobile lint fails: 3 `@typescript-eslint/no-unsafe-assignment` errors in `station-aggregate-status.integration.spec.tsx:181` area — `pnpm --filter mobile lint` exits non-zero.

### 2.11 Mail module

Real nodemailer SMTP with env-gated fallback (`src/mail/mail.service.ts:25-51`), but: the only module with **zero tests**; user-supplied problem-report `description` is interpolated into HTML email without escaping (`mail.service.ts:163` — HTML injection); only one email type exists.

---

## 3. NOT DONE — missing, stubbed, mocked, or partially implemented

### 3.1 Unified Payments (README #3)

No end-to-end payment path works:

- **Apple Pay / Google Pay native modules do not exist.** `src/features/payments/apple-pay/apple-pay.ts:102` and `google-pay/google-pay.ts:102` bridge to `NativeModules.LiloApplePay`/`LiloGooglePay` — there is no native iOS/Android code, no Expo config plugin, and no `ios/`/`android/` directories in the repo. `resolveApplePayNativeModule()` always returns `null`; every real invocation throws `ApplePayUnavailableError`.
- **ArCa/Idram mobile flows are inert**: the onboarding payment screen stores the choice in memory and does nothing else — no card entry, no redirect/deeplink, no token exchange for ARCA/IDRAM (`payment-method-screen.tsx:89-147` handles only APPLE_PAY/GOOGLE_PAY, which can't run per above).
- **Backend gateway clients exist but are not production-complete**: no webhook/callback endpoints and no signature/checksum verification anywhere in `src/payments/` (real ArCa/Idram integrations require result callbacks); Apple/Google Pay silently fall back to a **deterministic local sha256 pseudo-token** when `*_TOKEN_EXCHANGE_URL` is unset (`apple-pay.client.ts:69-74,123-129`, `google-pay.client.ts:69-74`) and captures route through ArCa with that fake token (`payments.service.ts:735-741`); Idram "pre-auth" is only a balance check with no hold (`payments.service.ts:452-463`); no idempotency keys on gateway calls.
- No card-management UI, no payment history UI.
- **Unverifiable**: behavior against real ArCa/Idram/Apple/Google sandboxes — all "sandbox" tests mock `fetch` (`payment-gateways.sandbox.spec.ts`); `docs/step-69-sandbox-testing-complete.md` admits "no real network requests" despite its title.

### 3.2 Two-Tap QR Charging (README #4)

**Entirely absent on mobile.** Zero hits for `qr|camera|scan` in `app/` + `src/` (non-test); no `expo-camera`/`expo-barcode-scanner` dependency; no session confirm/start/stop/monitoring/receipt screens; the only session artifact is a well-tested Socket.IO monitoring client (`src/features/sessions/session-monitoring-client.ts`) imported by no screen. The backend piece is also unwired (§2.6). The headline feature does not exist in any tappable form. *(The PromptBook itself has no build step for a QR screen — a plan gap, see §6.)*

### 3.3 Community features (README #6)

- **Mobile write side absent**: no review submission, no rating input, no photo upload, no problem-report UI, no status-update UI. Only read-only crumbs (avg rating + 2-review preview in the bottom sheet, `station-bottom-sheet.tsx:169-196`).
- **Photo upload does not exist on the backend either**: reviews accept photo URL *strings* into a `photos` column (`src/reviews/reviews.service.ts:101`); there is no upload endpoint, no S3/Cloudinary integration anywhere (grep: zero hits) — PRD step 41 promised uploads.

### 3.4 OCPP 2.0.1 (README #7 claim)

Types only: `packages/shared-types/src/ocpp2.ts` (306 lines). `OCPP_PROTOCOLS = ['ocpp1.6']` (`src/ocpp/ocpp.constants.ts:8`); no `TransactionEvent`, no 2.0.1 routing. README's "Works with any OCPP 1.6-J or 2.0.1 compliant charger" is false for 2.0.1; `docs/step-68-ocpp-compatibility-summary.md` itself admits "TYPES READY, IMPLEMENTATION PENDING (8 weeks)". The same doc's "Tested hardware: ABB Terra 54/184, Schneider EVlink, Wallbox Pulsar Plus" claim is **unverifiable** (its own validation section says e2e was skipped).

### 3.5 In-app wallet (PRD steps 44-45, 57)

- Backend wallet service is real (atomic `$transaction` top-up/deduct/refund + ledger, `src/wallet/wallet.service.ts:108-290`) **but defective**: top-up passes `input.paymentMethodId ?? ''` directly as the ArCa/Idram gateway token — it never resolves the stored PaymentMethod token, so an empty string can go to the gateway (`wallet.service.ts:123,142`); no idempotency (order ids from `Date.now()`, `wallet.service.ts:126`); `captureForGateway` has no WALLET branch (`payments.service.ts:506-508`).
- **No wallet UI whatsoever on mobile** (no balance, top-up, or transaction screens).

### 3.6 Push notifications (PRD step 39)

Backend FCM is DONE (§1), but on mobile push **cannot work**: `initializeFcmRuntime` (`src/features/notifications/fcm-runtime.ts`) is called from nowhere, and no messaging SDK exists — `@react-native-firebase/messaging`/`expo-notifications` are not dependencies; the `FcmMessagingAdapter` interface has no concrete implementation. Orphaned library code.

### 3.7 Database migrations (steps 4-6)

**No baseline migration exists.** The 7 migrations in `apps/api/prisma/migrations/` only ALTER pre-existing tables or add 4 tables; the earliest (`20260217154000_add_geospatial_entities/migration.sql:1-3`) starts with `ALTER TABLE "stations"` — 12 of 16 Prisma models have no CREATE TABLE migration. `prisma migrate deploy` **fails on a fresh database**, which is exactly what the K8s migration job runs (`infrastructure/k8s/jobs/migration-job.yaml:46`). (Confirmed empirically: this audit had to use `prisma db push` + manual SQL to provision the e2e database.) The TimescaleDB hypertable/continuous-aggregate and PostGIS trigger SQL that do exist are real and correct.

### 3.8 Mobile screens that are stubs or missing

- **Profile tab**: 52-line stub showing a title and the API base URL (`src/features/profile/profile-screen.tsx:14-24`). No account info, settings, logout, payment methods, or language switcher.
- **Station detail route `/stations/[id]`**: navigated to but does not exist (§2.1).
- **Offline/poor-connectivity behavior**: no NetInfo, no offline banner, no retry/backoff, no react-query; the built cache interceptor is unregistered (§2.10); offline map tiles are a mock no-op (§2.1).

### 3.9 Other stubs / dead code / orphans (full marker sweep)

Source has **zero TODO/FIXME/HACK markers** — the stubs are silent:

| Location | Nature |
|---|---|
| `apps/api/src/auth/auth.service.ts:54-72` | "OTP sent successfully" with no delivery channel |
| `apps/api/src/payments/apple-pay.client.ts:69-74`, `google-pay.client.ts:69-74` | pseudo-token fallback stubs |
| `apps/api/src/observability/opentelemetry.ts:48-49` | `void meterProvider;` dead metrics wiring |
| `apps/api/src/ocpp/ocpp.routing.service.ts:86` | `NotImplemented` for Authorize/DataTransfer/all 2.0.1 actions |
| `apps/mobile/metro.config.js:20-26` + `src/__mocks__/rnmapbox-maps.js` | mock map shipped in all builds; no-op offline packs |
| `apps/mobile/src/features/stations/stations-screen.tsx:76-141` | `FALLBACK_STATIONS` hardcoded placeholder data |
| `apps/mobile/src/features/sessions/session-monitoring-client.ts`, `src/api/cache-interceptor.ts`, `src/features/notifications/fcm-runtime.ts`, `src/features/favorites/favorites-api.ts` | complete, tested, **never imported by any screen** (dead code) |
| `apps/mobile/e2e/screenshots/screenshot-utils.ts:83-87` | `setupMockData()` admitted stub |
| `packages/shared-utils/src/index.ts` | **3 lines** — the whole package is an empty shell |
| `run-promptbook-tenant-admin.sh` (repo root) | foreign artifact from a different project ("Bastion", 84 mentions; zero relation to LiloCharge) |
| `apps/mobile/store-assets/metadata/metadata.test.ts`, `docs/privacy-policy/privacy-policy.test.ts` | orphaned tests no runner ever executes |

### 3.10 Endpoint inventory status

All implemented HTTP endpoints return real data (none return hardcoded/mock responses); the inventory with per-endpoint detail: auth (4), health (1), users (5), vehicles (5), payments (3), wallet (3), notifications (2), sessions (6), stations (3), connectors (2), connector-status-updates (3), favorites (3), reviews (5), problem-reports (3) — see module verdicts above. **Missing endpoints** (features that need them): payment webhooks/callbacks (ArCa, Idram), photo upload, any admin/operator surface.

---

## 4. Unverifiable in this environment

| Item | Why |
|---|---|
| Real payment gateway behavior (ArCa, Idram, Apple/Google Pay) | Requires live credentials; all repo "sandbox" tests mock `fetch` |
| FCM delivery | Requires Firebase project credentials |
| OCPP against real hardware (ABB/Schneider/Wallbox claims in docs) | No hardware; doc claim has no supporting evidence in repo |
| K8s deployment, HPA, backup CronJob | No cluster; manifests validated only statically |
| k6 load-test thresholds (1,000 VU / 10,000 WS) | Needs k6 binary + deployed API; never executed (the `k6` npm dependency is a 0.0.0 placeholder package) |
| Detox iOS/Android runs | No native projects committed (`expo prebuild` never run); no macOS/emulator here |
| TimescaleDB-specific behavior (hypertables, continuous aggregates, retention) | TimescaleDB unavailable in this environment (Docker registry blocked); e2e ran against plain PG16+PostGIS — the migration SQL itself was reviewed and is well-formed |

---

## 5. Test-suite health

### 5.1 Inventory

**124 test files, ~860 cases**: 77 in `apps/api` (unit + 1 controller-integration + 5 e2e + k6 config validator), 45 in `apps/mobile` (unit/RTL integration + 2 Detox files + 1 orphan), 1 orphan in `docs/`, **0 in `packages/`** (`shared-types`: "No tests for types package"; `shared-utils`: "No tests yet" — both echo stubs). No `.skip`/`.only`/`.todo` anywhere. No coverage thresholds configured in any jest config (AGENTS.md demands >85% on business logic; never measured). Load tests: k6 HTTP (ramp to 1,000 VUs, p95<200ms) and WebSocket (10,000 connections) configs + shell runner, regression-guarded by a 32-case config-validator spec.

### 5.2 Execution results (this audit, 2026-07-02)

Environment: pnpm install (with `--ignore-scripts` + manually placed Prisma 5.22 engines — the registry for engine binaries is proxy-blocked here), `shared-types`/`shared-utils` built first, local PostgreSQL 16 + PostGIS on :5437 and Redis 7 on :6382 provisioned to replace the docker-compose test stack (Docker Hub blocked by network policy), schema created via `prisma db push` + the PostGIS/pg_trgm migration SQL (no TimescaleDB available — plain tables).

| Run | Result |
|---|---|
| `packages/shared-types`, `shared-utils` tests | **None exist** (echo stubs) |
| `apps/mobile` jest | **42/42 suites, 280/280 tests PASS** (~35s). Caveat: fails in a fresh checkout until `shared-types` is built (`Cannot find module '@lilocharge/shared-types'` in 18 suites) — CI-fragile. |
| `apps/api` jest, no infra | 69/74 suites pass; **475 pass / 47 fail** — all 47 failures are the 5 e2e suites erroring on `Can't reach database server at localhost:5437` |
| `apps/api` e2e, live infra, per-suite on a clean DB | See table below |
| `turbo run typecheck` | **API FAILS** — 2 real errors: `src/stations/stations.service.ts:254` and its spec — production mapping omits `connectorCount`/`maxPowerKw` required by `StationNearbyResponse` (§2.9). Other 4 workspaces pass. |
| lint | API passes (0 problems). **Mobile FAILS** — 3 `no-unsafe-assignment` errors in `station-aggregate-status.integration.spec.tsx`. |
| Detox e2e | **Not runnable**: `.detoxrc.json` points at `ios/`/`android/` build outputs that don't exist (managed Expo, never prebuilt); the only suite generates store screenshots and targets testIDs that exist nowhere in the app (`charging-map`, `start-charging-button`, `charging-session-active` vs actual `stations-map`, `station-bottom-sheet`); it references a charging-active screen the app doesn't have. Zero functional e2e flows. |
| k6 load tests | Not executed (see §4) |

**API e2e suites, each against a freshly reset DB + flushed Redis:**

| Suite | Result | Root cause of failures |
|---|---|---|
| `auth-registration.e2e.spec.ts` | **5 / 6 pass** | "reject OTP request for already registered phone" expects **409**, gets **429**: the P0-Security `@Throttle` (5 OTP req/5min/IP) was added after the suite was written; its earlier tests exhaust the budget. Suite can never fully pass as written. |
| `ocpp-compatibility.e2e.spec.ts` | **1 / 26 pass** | **Latent test bug — the suite has never worked**: `createOcppClient()` constructs an ocpp-rpc `RPCClient` but never calls `client.connect()` (`ocpp-compatibility.e2e.spec.ts:210-227`; ocpp-rpc requires an explicit `await client.connect()`), so every connection test hits the 5s timeout. The one pass ("rejects empty identity") fails client-side, not via the server. Consistent with `docs/step-68`'s own admission that e2e was never executed. |
| `multi-operator-sessions.e2e.spec.ts` | **2 / 2 PASS** | — |
| `session-monitoring.e2e.spec.ts` | **6 / 6 PASS** | — |
| `session-stop-receipt.e2e.spec.ts` | **0 / 7 pass** | Every request gets **401**: the suite predates the global `JwtAuthGuard` (P0-Security) and sends no Authorization header; never updated. |

Net: **14 / 47 e2e tests pass** even with correct infrastructure. Two suites genuinely exercise full session lifecycles end-to-end and pass; three are broken — two by the (correct) security hardening that the test code was never updated for, one by a bug that proves it never ran.

### 5.3 Additional e2e health issues

- **Data isolation is broken across suites**: suites seed fixed phone numbers/emails and rely on their own `afterAll` cleanup; any prior failure leaves rows behind and subsequent seeds die on unique constraints (`session-stop-receipt.e2e.spec.ts:112` — "Unique constraint failed on the fields: (phone)"). Running all 5 suites together (`--runInBand`) produces cross-contamination; only per-suite runs against a reset DB are reliable.
- The security-hardening step (P0) was landed **without updating the pre-existing e2e suites** (401s in stop-receipt, 429 in auth) — i.e., the full API test suite has been red since that change, and nothing in CI catches it because e2e needs infra CI doesn't provision.
- There is **no jest project split** between unit and e2e, no testcontainers, and no committed docker-compose file for the :5437/:6382 test stack the suites hardcode — a fresh contributor cannot discover how to run them.

### 5.4 Real-life scenario coverage

| Scenario | Coverage | Evidence / gap |
|---|---|---|
| Full lifecycle: QR scan → confirm → start → stop → billing | **Partial (backend-only, stitched)** | `sessions-qr-to-start.spec.ts` (QR payload → session → OCPP RemoteStart, mocked Prisma), `session-stop-receipt.e2e.spec.ts`, `multi-operator-sessions.e2e.spec.ts`, cost math unit specs. **No test covers the production wiring** (which doesn't exist, §2.6); no mobile-side flow test (no UI exists); no user-confirm step anywhere. |
| Payment success + failure per provider | **Yes at unit level, all 4 providers** (`payment-gateways.sandbox.spec.ts`: 26 cases — declines, insufficient funds, invalid token, timeouts, 5xx, concurrency; plus per-client and service specs) | All network mocked; zero tests against real sandboxes; no webhook tests (no webhooks). |
| OCPP connect/disconnect/reconnect + malformed messages | **Yes** (`ocpp-compatibility.e2e.spec.ts`: 26 cases incl. reconnect, malformed payloads, unsupported actions, invalid idTag) | Requires live infra; see clean-run result above. Unit backup: registry/routing/server specs. |
| Station availability updates + confidence scores | **Yes** (confidence: `connector-status-updates.service.spec.ts`; cascade: `connectors.service.spec.ts`, `stations.queries.spec.ts`; broadcast: `ocpp.status-broadcast.service.spec.ts`; mobile display: `station-aggregate-status.integration.spec.tsx`) | No mobile test for *displaying* confidence (no such UI). |
| Offline / poor connectivity | **Partial** — cache TTL/expiry (`cache-interceptor.spec.ts`), network-failure wrapping (`api-client.spec.ts`), offline tile pack creation (`station-offline-tiles.spec.ts`) | The tested cache/tiles code is dead/mocked in the shipped app; no NetInfo, no reconnect tests for the monitoring socket, no queue/retry, no airplane-mode e2e. |
| Three languages render correctly | **Yes (jsdom level)**: 37-case Armenian rendering suite, 32-case switching suite, key-parity checks | No on-device rendering verification (Detox unrunnable); missing hy key slipped through because the parity test compares structure of typed resources, not runtime key usage. |
| Charger offline mid-session → session failed → recovery (PromptBook step 59) | **No test found** | Gap. |
| Concurrent session attempts on one connector (step 62) | **No test found** | Gap (and no evidence of a concurrency guard in `sessions.service.ts`). |
| Zero-energy session auto-refund (step 61) | Refund-on-FAILED exists (`sessions.service.ts:607-612`) with service-level specs | No dedicated zero-energy e2e. |
| Wallet top-up → session debit (step 57) | Unit specs only; no e2e | Gap. |

### 5.5 E2E verdict and priority flows

**Mobile/product E2E tests do not exist.** API-level e2e exists for auth, OCPP, and sessions (with the health issues above). Critical user flows needing E2E, in priority order:

1. **QR scan → confirm → start → live monitoring → stop → receipt → payment capture** (the product's core loop; currently has neither UI nor wiring nor test)
2. **Payment capture/failure/refund per provider incl. webhook callbacks** (money path)
3. **Registration → OTP SMS → login → session restore after app restart** (currently restarts onboarding every launch)
4. **Charger disconnect mid-session → session FAILED → auto-refund → user notified** (fault path, step 59/61)
5. **Concurrent start attempts on one connector** (step 62)
6. **Offline/flaky network: cached stations shown, actions queued/retried, monitoring socket reconnect**
7. **Station discovery on real map: locate → filter → detail → favorite** (on-device, real Mapbox)
8. **Language switch hy↔ru↔en on device, Armenian glyph rendering**

---

## 6. Documentation discrepancies (evidence vs claims)

1. **Every README documentation link is broken**: `docs/prd.md`, `docs/api/README.md`, `docs/adr/README.md`, `docs/deployment.md`, `docs/testing.md` — none exist (`docs/` has `DEPLOYMENT.md` and step summaries instead). AGENTS.md instructs agents to "Read the PRD (/docs/prd.md)" — a file that never existed; PromptBook steps cite PRD line ranges of that nonexistent file.
2. **The two production-readiness reports contradict each other**: `scripts/PRODUCTION_READINESS_REPORT.md` (2026-02-18) claims JWT auth + throttling implemented and recommends rollout; `docs/production-readiness-report.md` (2026-02-21) found zero guards and no throttler. (The P0-Security promptbook subsequently fixed those — §1 — but neither report reflects the current state.)
3. **README over-claims OCPP 2.0.1** (§3.4) and "Two-Tap Charging" (§3.2 — no QR/session UI exists).
4. **`docs/step-69-sandbox-testing-complete.md`** is titled "COMPLETED ✅" while admitting all "sandbox" tests are fetch mocks with no real network.
5. **`docs/step-68` hardware-tested claim** is unsupported by anything in the repo.
6. **PromptBook numbering is internally inconsistent** (header says steps 1-55/56-75; body contains 1-50/51-70; steps 71-75 don't exist) and steps 6-50 are one-line stubs "[truncated for brevity]" — most of the system was never actually specified.
7. **Foreign artifact**: `run-promptbook-tenant-admin.sh` belongs to a different project entirely.

---

## 7. Bottom line

Roughly: **backend ~75% of the promised product** (missing: SMS, payment callbacks, charger command wiring, OCPP 2.0.1, baseline migration), **mobile ~30%** (discovery + onboarding shells exist; the charging/payments/community core is absent), **test suite broad but with a red typecheck, a red mobile lint, three broken e2e suites, and zero product-level E2E**. The single most important fact for planning: **the app cannot charge a car** — no QR/session UI on mobile, and even server-side the sessions API never talks to the charger. See [BACKLOG.md](BACKLOG.md) for the prioritized work list.
