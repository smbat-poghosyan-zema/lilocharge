# LiloCharge — Audit Backlog

Derived from [AUDIT-REPORT.md](AUDIT-REPORT.md) (2026-07-02). Every NOT DONE and NEEDS REFACTORING finding maps to a task below.

**Priority:** P0 = product cannot ship / cannot charge a car / build is red · P1 = production-blocking quality, security, money-path integrity · P2 = polish, debt, docs.
**Effort:** S ≤ 1 day · M = 1–5 days · L > 1 week.
**Category:** fix (defect in existing code) / refactor / implement (missing feature) / test.

> **Round 2 (2026-07-07):** an independent re-audit verified Rounds P0-P2 as genuinely done
> and opened a new, smaller round — see **Round 2** at the bottom of this file (R1-R23;
> eight ship-blockers R1-R8 in the money path, device readiness, and deployment config).

> **Status update (2026-07-07):** All P2 tasks (#29-#37) are now implemented too — the backlog is
> closed. Highlights: Prometheus/OTel MeterProvider actually registered (#29); **OCPP 2.0.1 core
> charging profile implemented** — subprotocol negotiation, BootNotification/Heartbeat/
> StatusNotification/Authorize/TransactionEvent lifecycle, RequestStart/StopTransaction; no
> reservations, smart charging, firmware/display management, device model, or security events
> (#30); real Detox functional flows + a testID guard suite (#31, emulator hardware still needed
> to execute them); CI gates on typecheck + non-mutating lint + coverage floors (API 85%/mobile
> 86% statements, measured with headroom), shared-types built before mobile jest, an e2e job with
> Postgres/Redis service containers mirroring docker-compose.test.yml, and both orphaned test
> files adopted into runnable suites — which surfaced real defects: iOS store keywords exceeded
> Apple's 100-char limit and a jest dot-path misuse masked a release-notes assertion (#32); load
> tests executed with results in docs/load-test-results.md — ~2,000 rps/process, p95 target met
> up to ~100 connections, 1,500 WS connections held (#33); foreign `run-promptbook-tenant-admin.sh`
> and the empty `@lilocharge/shared-utils` package deleted, nothing imported it (#34); docs
> reconciled — docs/prd.md created, README links/features fixed, the contradictory readiness
> reports replaced by a single current-state docs/production-readiness-report.md, AGENTS.md
> corrected (i18n layout, testing split, shared-utils) (#35); server-side favorites sync (#36);
> wallet-path sessions e2e (#37). Verified 2026-07-07: API 84 unit suites / 678 tests + 7 e2e
> suites / 63 tests green, mobile 68 suites / 529 tests green, tsc + eslint clean everywhere.
> **Still open (environment-dependent, tracked in docs/production-readiness-report.md):** native
> Apple/Google Pay modules, real gateway sandbox validation, FCM credentials, OCPP hardware
> validation, mobile refresh-token rotation, offline-session watchdog, distributed load test at
> 1,000 VU / 10,000 WS, real K8s cluster rollout.

> **Status update (2026-07-06):** All eight P0 tasks AND all P1 tasks (#9-#28) are implemented on
> `claude/lilocharge-audit-58jj4m` (P0: `ff08519`…`ffe8587`; P1: `7200fd2`…`576f4fd`).
> Verified: API 80 suites / 608 unit tests green, **all 5 e2e suites 47/47 green in a single run**
> (previously 14/47 with three suites broken since inception), mobile 65 suites / 496 tests green,
> tsc and eslint clean everywhere. The e2e resurrection surfaced and fixed two real product bugs:
> OCPP idTags exceeded the protocol's 20-char limit (now short Redis-mapped tokens), and stop
> billing ignored meterStop-meterStart registers (now authoritative, fixing under-billing).
> Still open (candidates for P2 hardening): refresh-token rotation on mobile (401 signs out),
> charger-inbound StartTransaction linking to API-created sessions, an offline-session watchdog
> (disconnects are logged, not auto-failed), and real gateway sandbox verification (webhook
> signature scheme is a documented adaptation point).

---

## P0 — core product & red build — ✅ done

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

## P1 — money path, security, broken tests, missing product surface — ✅ done

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

## P2 — debt, tooling, docs — ✅ done

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

---

# Round 2 — from the 2026-07-07 re-audit

> **Round 2 resolved (2026-07-07):** all Round-2 findings (R1-R23) are implemented on
> `claude/lilocharge-audit-58jj4m`. The headline R1 seam is welded — a charger's inbound
> StartTransaction/TransactionEvent now attaches to the API-created session instead of
> double-booking (proven by a new mixed-flow e2e over a real socket); the concurrency guard
> and a shared SessionSettlementService (zero-energy refund + wallet deduct) now cover all
> three session paths; wallet writes are atomic with a balance>=0 constraint and persist-
> first idempotency; webhook/capture races use conditional transitions; the monitoring
> gateway authenticates and the mobile client + receipt download carry the token; token
> refresh + session-context propagation, push lifecycle, and a full logout sweep are wired;
> K8s carries every required env var, OCPP has a routable ingress, the migration prisma is
> pinned, and app.json/eas.json are release-buildable. The re-audit round also surfaced a
> real gap while triaging dead code: wallet-paid session refunds never credited the wallet
> (now wired). Verified: API 85 unit suites / 719 tests + 7 e2e / 65 tests, mobile 67 suites
> / 501 tests, tsc + eslint clean everywhere. **Environment-dependent items remain open**
> (real gateway sandbox validation, native Apple/Google Pay modules, FCM credentials, OCPP
> hardware, distributed 1000-VU/10k-WS load, K8s cluster rollout, filling the REPLACE_ME
> production secrets/URLs) — these need credentials/hardware/infra, not code.


Independent re-verification (fresh-eyes API/mobile/config audits — see the re-audit
section of [AUDIT-REPORT.md](AUDIT-REPORT.md)) confirmed Rounds P0-P2 are genuinely done
and surfaced a new, much smaller round. Priorities: **R-P0** = ship-blocker (money path
or first-hour device experience), **R-P1** = pre-production hardening, **R-P2** = debt.

## R-P0 — ship-blockers — ✅ done

| # | Task | Area | Effort |
|---|---|---|---|
| R1 | **Link charger-inbound StartTransaction/TransactionEvent(Started) to the API-created session** instead of creating a duplicate: consume the (currently write-only) Redis remote-start tracking to attach `transactionId` to the AUTHORIZED/ACTIVE API session; only create a fresh session when no tracked remote start matches. Add a mixed-flow e2e (API start → charger StartTransaction → meter values → API stop sends RemoteStop → single session billed correctly). Today the flagship QR flow double-books, cannot stop the charger, refunds the pre-auth, and completes the duplicate unbilled. | api/ocpp+sessions | M |
| R2 | **Extend the one-session-per-connector guard to the OCPP creation paths** (`createActiveOcppSession`, used by 1.6 StartTransaction and 2.0.1 Started) — currently 1 of 3 paths guarded. | api/sessions | S |
| R3 | **Unify stop-path settlement**: `finalizeStoppedSession` (1.6 Stop + 2.0.1 Ended) must apply the zero-energy-refund rule and the wallet-deduct branch that only the API stop path has — wallet-default users are currently never billed on charger-initiated stops, and 0-kWh charger stops bill time/session fees. | api/ocpp+sessions | M |
| R4 | **Wallet/payment atomicity batch**: conditional-update or SERIALIZABLE wallet balance writes (lost-update today); persist-then-reuse idempotency for top-up and session pre-auth (currently minted only after gateway success → retry double-charges); conditional status transitions so webhooks cannot race the synchronous capture; deduct BEFORE completing wallet sessions (or create a receivable). Unique index on `wallet_transactions.idempotency_key`. | api/wallet+payments | M |
| R5 | **Mobile receipt fix**: authenticated fetch + share/save instead of bare `Linking.openURL` (always 401 today); hide the button for non-COMPLETED sessions. | mobile/sessions | S |
| R6 | **Monitoring socket fixes**: use `getApiBaseUrl()` in `session-monitoring-client.ts` (connects to localhost on devices — one line) and add auth to the API-side monitoring gateway (currently anyone can subscribe to any session's live metrics). | mobile+api | S |
| R7 | **Token refresh + session-context subscription**: use the persisted refresh token on 401/expiry (`/auth/refresh` is never called today) and make `OnboardingSessionProvider` subscribe to storage so a wiped session propagates — users currently break silently one hour after login. | mobile/auth | M |
| R8 | **Production config completion**: add to K8s manifests + deploy script (and prune ghosts `MAPBOX_TOKEN`/`FCM_SERVER_KEY`): `REFRESH_TOKEN_SECRET` (login 500s), `ARCA/IDRAM_WEBHOOK_SECRET` (callbacks 503), SMS/Twilio vars (OTP silently skipped), FCM service-account vars (push no-ops), uploads S3 vars (503), `CORS_ORIGIN` (+ pick one CORS layer). Reference: `apps/api/.env.example`. | infra/k8s | M |

## R-P1 — pre-production hardening — ✅ done

| # | Task | Area | Effort |
|---|---|---|---|
| R9 | OCPP ingress path: route/LB for port 9220 with session affinity + WebSocket-appropriate timeouts (unreachable from outside the cluster today; 60s proxy-read-timeout would drop sockets). | infra/k8s | M |
| R10 | Migration job: pin/ship the prisma CLI in the image (job currently downloads unpinned latest at runtime — v6 vs client v5); document `migrate resolve --applied` baseline for pre-existing DBs in DEPLOYMENT.md. | infra | S |
| R11 | Fix `backend.yml` deploy job condition (`secrets.*` is invalid in job-level `if` — workflow errors on main); keep `workflows.spec.ts` in sync. | ci | S |
| R12 | Mobile release readiness: bundle ids, permission plugins + localized usage strings (camera/photos/location/notifications), `@rnmapbox/maps` download token, per-profile `EXPO_PUBLIC_*` env in `eas.json`. | mobile/config | M |
| R13 | Push lifecycle: re-run bootstrap after login (fresh installs register no token until restart) and unregister the token on logout. | mobile/notifications | S |
| R14 | Logout sweep: clear favorites storage, the api-cache MMKV (previous user's wallet/profile data), and the push token (uses R13). | mobile/auth | S |
| R15 | Onboarding payment step: hand off to the real payment-methods flow (ARCA/IDRAM selections are inert; Pay bridges to nonexistent native modules) or clearly mark it skippable-informational. | mobile/onboarding | S |
| R16 | Move tokens to `expo-secure-store` or encrypted MMKV (plaintext today, 7-day refresh token). | mobile/auth | S |
| R17 | Support string transaction ids for 2.0.1 remote stop (station-assigned UUID-like ids can't be remote-stopped today). | api/ocpp | S |
| R18 | Multi-replica correctness: move OCPP transaction-id/sequence allocation off in-memory wall-clock counters (collides across HPA replicas); consider prod fail-fast when Redis is absent and when `OCPP_AUTH_MODE=open`. | api/ocpp | M |

## R-P2 — debt and polish — ✅ done

| # | Task | Area | Effort |
|---|---|---|---|
| R19 | Dedupe cross-agent helpers: single `buildCandidateEvseIds` (×3 + hand-synced inverse), shared `resolveErrorMessage` (×16), mobile `formatDramAmount` (×3) and `normalizeRouteParam` (×6) into shared homes. | api+mobile | S |
| R20 | Decide wallet-refund reachability (`refundBalance` + REFUND type have zero producers) and remove or wire; delete mobile dead code (image-optimization, performance-hooks, expo-status-bar dep, unused cache helpers after R14 consumes them). | api+mobile | S |
| R21 | OTP SMS localization (English-only in an Armenian-first product; DTO carries no language). | api/auth+sms | S |
| R22 | UX polish: FAILED/CANCELLED summary badge styled as success; sign-in redirect loses the scanned connector; remove the debug API-URL footer from profile; i18n the lazy-load error boundary string; drop the 1 unused i18n key. | mobile | S |
| R23 | Ops polish: HPA/resource tuning per docs/load-test-results.md (request≈1000m vs current 250m); note SMTP is blocked by the 443-only egress policy; presign content-type constraint; webhook 404 → 200-ack-and-log; `GetWalletTransactionsDto` missing `@Max`; backup-restore timescaledb pre/post_restore documentation. | infra+api | S |
