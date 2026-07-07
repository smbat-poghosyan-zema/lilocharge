# LiloCharge — Production Readiness Report

**Date:** 2026-07-07
**Supersedes:** the 2026-02-21 version of this file and the deleted 2026-02-18
snapshots that lived in `scripts/` (`PRODUCTION_READINESS_REPORT.md`,
`STEP_70_SUMMARY.md`, `production-readiness-checklist.md`). Those documents
contradicted each other and no longer described the codebase; this one is a
short pointer to the current evidence.

## Where the truth lives

- [AUDIT-REPORT.md](../AUDIT-REPORT.md) — full code-level audit (2026-07-02)
  that produced the remediation backlog.
- [BACKLOG.md](../BACKLOG.md) — every finding as a task, with dated status
  notes. All P0, P1, and P2 items (#1–#37) are implemented as of 2026-07-07.
- [prd.md](prd.md) — current-state product requirements and feature status.
- [load-test-results.md](load-test-results.md) — executed load tests
  (2026-07-07) with methodology and caveats.
- [DEPLOYMENT.md](DEPLOYMENT.md) — deployment guide (Docker Compose + K8s).

## Current state (verified 2026-07-07)

- **Build health:** typecheck, lint (non-mutating, `--max-warnings 0`), unit
  tests, and API e2e tests are all green. CI enforces typecheck, lint, unit
  tests with coverage floors, and runs the API e2e suites against
  Postgres/Redis service containers mirroring
  `infrastructure/docker/docker-compose.test.yml`.
- **Security:** JWT auth guards on all non-public endpoints, throttling,
  helmet, payment webhook signature verification with idempotency keys, OCPP
  charge-point authentication (open/allowlist/basic + wss support), bcrypt,
  no secrets in source.
- **Performance:** measured single-process lower bound of ~2,000 req/s with
  p95 < 200 ms up to ~100 concurrent connections; 1,500 concurrent WS
  connections held. See load-test-results.md for caveats.

## Genuinely remaining go-live items

These are environment-dependent and cannot be closed from inside the repo:

1. **Real payment-gateway sandbox validation** — ArCa/Idram/Apple/Google
   sandbox behavior is unverified; the webhook signature scheme is a
   documented adaptation point.
2. **Native Apple Pay / Google Pay modules** — out of scope by decision; the
   backend requires a configured token-exchange service and fails loudly
   without it.
3. **FCM delivery** — push wiring is complete but real delivery needs
   production Firebase credentials.
4. **OCPP hardware validation** — the 1.6-J core and 2.0.1 core charging
   profile pass the e2e simulators; real charger models still need a bench
   test (see ocpp-hardware-testing.md).
5. **Distributed load test at target scale** — the 1,000-VU HTTP / 10,000-WS
   targets need a staging cluster and distributed load generators; only
   single-host lower bounds have been measured.
6. **K8s cluster deploy** — manifests exist and are validated statically; a
   real cluster rollout (with the OCPP port 9220 service) is untested.
7. **Mobile hardening backlog** — refresh-token rotation on mobile (a 401
   currently signs the user out) and an offline-session watchdog (charger
   disconnects are logged, not auto-failed).
