# LiloCharge — Audit Backlog

Derived from [AUDIT-REPORT.md](AUDIT-REPORT.md) (2026-07-02). Every NOT DONE and NEEDS REFACTORING finding maps to a task below.

**Priority:** P0 = product cannot ship / cannot charge a car / build is red · P1 = production-blocking quality, security, money-path integrity · P2 = polish, debt, docs.
**Effort:** S ≤ 1 day · M = 1–5 days · L > 1 week.
**Category:** fix (defect in existing code) / refactor / implement (missing feature) / test.

---

## P0 — core product & red build

| # | Task | Category | Affected files | Effort |
|---|---|---|---|---|
| 1 | **Build the mobile charging-session flow**: QR scan screen (add `expo-camera`/barcode scanner), connector confirm, start/stop, live monitoring screen (use the existing orphaned `session-monitoring-client.ts`), receipt view. This is the headline "Two-Tap Charging" feature and currently has zero UI. | implement | `apps/mobile/app/*` (new routes), `apps/mobile/src/features/sessions/*`, `apps/mobile/package.json` | L |
| 2 | **Wire the sessions API to OCPP remote commands**: `POST /users/:userId/sessions/:sessionId/start|stop` must invoke `OcppRemoteStartService`/`OcppRemoteStopService`; fix API-driven stop billing 0 (totalCost only computed on the OCPP StopTransaction path). | implement | `apps/api/src/sessions/sessions.service.ts`, `apps/api/src/sessions/sessions.module.ts`, `apps/api/src/ocpp/ocpp.remote-{start,stop}.service.ts` | M |
| 3 | **Make the mobile API base URL configurable and attach/persist auth**: read `EXPO_PUBLIC_API_URL` (all 5 clients currently hardcode `http://localhost:3000`); pass token interceptors to default clients; persist tokens + onboarding completion (SecureStore/MMKV) so cold start doesn't repeat onboarding and authed endpoints don't 401. | fix | `apps/mobile/src/config/runtime.ts`, `src/api/api-client.ts`, `src/features/*/(*-api.ts)`, `src/features/onboarding/onboarding-session.tsx`, `app/index.tsx` | M |
| 4 | **Ship real Mapbox on native**: platform-gate the Metro mock (today `metro.config.js:20-26` substitutes the mock in every build); make offline-tile download real or remove the button (mock `createPack` fakes success). | fix | `apps/mobile/metro.config.js`, `src/__mocks__/rnmapbox-maps.js`, `src/features/stations/station-offline-tiles.ts` | M |
| 5 | **Remove `FALLBACK_STATIONS` fake data** (4 fictional Yerevan stations shown as real); replace with an explicit empty/error state. | fix | `apps/mobile/src/features/stations/stations-screen.tsx:76-141` | S |
| 6 | **Create a Prisma baseline migration** so `prisma migrate deploy` works on a fresh database (12 of 16 models have no CREATE TABLE migration; the K8s migration job fails as-is). Verify against an empty PG16+PostGIS+TimescaleDB instance. | fix | `apps/api/prisma/migrations/*`, `infrastructure/k8s/jobs/migration-job.yaml` | M |
| 7 | **Fix the API typecheck failure**: `mapNearbyStationRawRowToResponse` omits `connectorCount`/`maxPowerKw` required by `StationNearbyResponse` (the nearby API response actually lacks the fields the 3-layer map pins consume). `tsc` is red on production code while jest is green. | fix | `apps/api/src/stations/stations.service.ts:253-266`, `stations.service.spec.ts:382` | S |
| 8 | **Integrate an SMS provider for OTP delivery** — `requestPhoneOtp` stores the code in Redis and returns "OTP sent successfully" without sending anything; phone registration is unusable in production. | implement | `apps/api/src/auth/auth.service.ts:54-72`, new SMS client module | M |

## P1 — money path, security, broken tests, missing product surface

| # | Task | Category | Affected files | Effort |
|---|---|---|---|---|
| 9 | **Complete ArCa/Idram server integration**: webhook/callback endpoints with signature/checksum verification (none exist); real Idram pre-auth hold (currently balance-check only); idempotency keys on all gateway calls. | implement | `apps/api/src/payments/{arca,idram}.client.ts`, `payments.controller.ts`, `payments.service.ts` | L |
| 10 | **Remove the Apple/Google Pay pseudo-token fallback** (silent local sha256 token when `*_TOKEN_EXCHANGE_URL` unset, then captured via ArCa) — fail loudly instead; decide and implement real native Pay: config plugin / native modules for `LiloApplePay`/`LiloGooglePay` (they don't exist), or descope and update README. | fix + implement | `apps/api/src/payments/{apple,google}-pay.client.ts:69-74`, `apps/mobile/src/features/payments/*`, native projects | L |
| 11 | **Build mobile payment UX**: ArCa card entry/tokenization and Idram flow in onboarding (today the choice is stored and nothing happens); payment-method management screen. | implement | `apps/mobile/src/features/onboarding/payment-method-screen.tsx:89-147`, new screens | L |
| 12 | **Fix wallet top-up token handling**: resolves stored `PaymentMethod` token instead of passing `input.paymentMethodId ?? ''` raw to the gateway; add idempotency (order ids currently `Date.now()`); add WALLET branch or guard in `captureForGateway`. Then build the missing wallet UI (balance, top-up, history). | fix + implement | `apps/api/src/wallet/wallet.service.ts:108-290`, `apps/api/src/payments/payments.service.ts:506-508`, new mobile screens | L |
| 13 | **Repair the three broken e2e suites**: add auth headers to `session-stop-receipt` (0/7, all 401 since the global JwtAuthGuard landed); make the auth 409-test throttler-aware (429); call `client.connect()` in the OCPP suite's `createOcppClient` (25/26 failing — suite never worked). | test | `apps/api/src/sessions/session-stop-receipt.e2e.spec.ts`, `src/auth/auth-registration.e2e.spec.ts`, `src/ocpp/ocpp-compatibility.e2e.spec.ts:210-227` | M |
| 14 | **Make e2e runnable and isolated**: commit a docker-compose test stack for :5437/:6382 (the suites hardcode it but nothing provides it); split jest into unit/e2e projects so `pnpm test` isn't red by default; add per-suite DB cleanup/reset (suites currently die on unique constraints if run together). | test | `apps/api/jest.config.js`, new `infrastructure/docker/docker-compose.test.yml`, e2e spec setup blocks | M |
| 15 | **OCPP hardening**: authenticate charge-point connections (credentials/allowlist; today any non-empty identity is accepted), support `wss://`, move remote-start tracking and registry out of process memory (Redis) — required before the K8s HPA (2–10 replicas) can be honest; expose port 9220 in K8s; add an `Authorize` handler. | refactor | `apps/api/src/ocpp/ocpp.server.service.ts:66-137`, `ocpp.remote-start.service.ts:70`, `ocpp.registry.service.ts`, `infrastructure/k8s/base/*` | L |
| 16 | **Station detail route**: create `/stations/[id]` (bottom-sheet "View details" currently navigates to a nonexistent route). | implement | `apps/mobile/app/stations/[id].tsx` (new), `src/features/stations/stations-screen.tsx:392` | M |
| 17 | **Mobile push notifications end-to-end**: add a messaging SDK (`@react-native-firebase/messaging` or `expo-notifications`), implement the `FcmMessagingAdapter`, and call `initializeFcmRuntime` at app start (all currently orphaned). | implement | `apps/mobile/src/features/notifications/*`, `app/_layout.tsx`, `package.json` | M |
| 18 | **Community write features**: review submission (stars/comment), problem-report form, crowdsourced status-update UI (backend endpoints all exist); plus a real photo-upload path (S3/Cloudinary + API endpoint — backend only stores URL strings today). | implement | new mobile screens; `apps/api/src/reviews/*` upload endpoint + storage client | L |
| 19 | **Surface confidence scores in mobile UI** (README headline; data is collected server-side and shown nowhere) and consume the status broadcast (or document polling as the design). | implement | `apps/mobile/src/features/stations/station-bottom-sheet.tsx`, stations API layer | M |
| 20 | **Offline behavior**: register the existing (fully tested, unused) cache interceptor on the API clients; add NetInfo-based offline banner and retry/backoff; reconnect logic for the monitoring socket. | implement | `apps/mobile/src/api/cache-interceptor.ts`, `src/api/api-client.ts`, `src/features/sessions/session-monitoring-client.ts` | M |
| 21 | **Geolocation**: add `expo-location`; stop anchoring nearby/search to hardcoded Yerevan center. | implement | `apps/mobile/src/features/stations/stations-screen.tsx:42-47`, `package.json` | S |
| 22 | **Language switcher + i18n fixes**: add in-app language switching (profile screen), add missing hy key `stations.map.filters.clear` (Armenian users currently see the raw key), call `PATCH /users/:id/language` on change. | fix + implement | `apps/mobile/src/i18n/locales/hy/common.json`, `src/features/profile/profile-screen.tsx` | S |
| 23 | **Build out the profile tab** (currently a 52-line stub): account info, vehicles, payment methods, logout. | implement | `apps/mobile/src/features/profile/profile-screen.tsx` | M |
| 24 | **Fix mobile lint** (3 `no-unsafe-assignment` errors → `pnpm --filter mobile lint` is red). | fix | `apps/mobile/src/features/stations/station-aggregate-status.integration.spec.tsx:181` | S |
| 25 | **Security headers + readiness checks**: add helmet/fastify-helmet (none exist); make `/health` check DB/Redis (currently static liveness payload). | fix | `apps/api/src/main.ts`, `src/health/health.controller.ts:13-21` | S |
| 26 | **Escape HTML in problem-report operator emails** (user-supplied `description` interpolated raw — HTML injection) and add MailService tests (only untested module). | fix + test | `apps/api/src/mail/mail.service.ts:163` | S |
| 27 | **Session concurrency guard + test**: reject a second start on an occupied connector (PromptBook step 62 — no guard or test found); add zero-energy auto-refund e2e (step 61) and charger-offline-mid-session fault test (step 59). | implement + test | `apps/api/src/sessions/sessions.service.ts`, new specs | M |
| 28 | **Fix `'WALLET' as never` enum drift** between shared-types and Prisma enums. | refactor | `apps/api/src/sessions/sessions.service.ts:322,363,380-381`, `packages/shared-types/src/payment.ts`, `apps/api/prisma/schema.prisma` | S |

## P2 — debt, tooling, docs

| # | Task | Category | Affected files | Effort |
|---|---|---|---|---|
| 29 | **Fix Prometheus/OTel wiring**: the `MeterProvider` is created and discarded (`void meterProvider`); register it (or prom-client) so the advertised metrics endpoint emits real data; add a trace exporter. | fix | `apps/api/src/observability/opentelemetry.ts:44-49` | M |
| 30 | **Implement OCPP 2.0.1 or retract the claim**: types exist (`ocpp2.ts`) but `OCPP_PROTOCOLS=['ocpp1.6']` and no 2.0.1 routing; either implement (large) or correct README/store listings now. | implement (L) or fix (S) | `apps/api/src/ocpp/*`, `README.md` | L/S |
| 31 | **Real functional Detox e2e**: run `expo prebuild` (or EAS) so Detox has native projects; replace the screenshot-only suite whose testIDs don't exist in the app (`charging-map`, `start-charging-button` vs actual `stations-map`); cover the §5.5 priority flows. | test | `apps/mobile/.detoxrc.json`, `e2e/*` | L |
| 32 | **CI/test hygiene**: build `shared-types` before mobile jest (18 suites fail on fresh checkout); gate CI on `typecheck` + lint (both currently red, unnoticed); add coverage thresholds (AGENTS.md demands >85%, never measured); adopt or delete the two orphaned test files (`store-assets/metadata/metadata.test.ts`, `docs/privacy-policy/privacy-policy.test.ts`). | test | `.github/workflows/*`, jest configs | M |
| 33 | **Execute the k6 load tests** against a deployed environment and record results (1,000 VU HTTP / 10,000 WS thresholds have never been run; the `k6` npm dep is a 0.0.0 placeholder). | test | `apps/api/load-tests/*` | M |
| 34 | **Delete dead/foreign artifacts**: `run-promptbook-tenant-admin.sh` (belongs to a different project); populate or remove `packages/shared-utils` (3-line shell with a "No tests yet" script). | refactor | repo root, `packages/shared-utils` | S |
| 35 | **Documentation truth pass**: create `docs/prd.md` (README + AGENTS.md link to it; it never existed), fix the 5 broken README doc links, reconcile the two contradictory production-readiness reports, correct the "Two-Tap Charging"/OCPP 2.0.1/"tested hardware" claims, document the e2e infra requirements. | fix | `README.md`, `docs/*`, `AGENTS.md` | M |
| 36 | **Server-side favorites sync**: wire the unused `favorites-api.ts` into the favorites screen (local-MMKV-only today) or delete it. | refactor | `apps/mobile/src/features/favorites/*` | S |
| 37 | **Sessions e2e for the wallet path** (top-up → session debit, step 57) once #12 lands. | test | `apps/api/src/sessions/*`, `src/wallet/*` specs | M |

---

### Suggested sequencing

1. **Red-build week (P0 #5, #7 + P1 #13, #14, #24):** small fixes that make `typecheck`, lint, and the full test suite honest and green — everything after this is verifiable.
2. **Charging core (P0 #1, #2, #3, #4, #6, #8):** after this, a user can actually find a real station and charge a car.
3. **Money path (P1 #9–#12):** payments become real and auditable.
4. **Hardening + product completeness (P1 #15–#28)**, then P2.
