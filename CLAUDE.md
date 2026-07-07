# CLAUDE.md — Working in this repository

Practical, session-tested guidance for AI agents and humans. Coding standards live in
[AGENTS.md](AGENTS.md); product state in [docs/prd.md](docs/prd.md); history in
[AUDIT-REPORT.md](AUDIT-REPORT.md) / [BACKLOG.md](BACKLOG.md). This file covers what
those don't: how to actually build, test, and verify here without stepping on the mines.

## Commands

```bash
pnpm install --ignore-scripts        # ALWAYS --ignore-scripts (see Prisma engines below)
pnpm --filter @lilocharge/shared-types build   # REQUIRED before mobile typecheck/tests on a fresh checkout

# API (apps/api)
npx tsc --noEmit                     # typecheck
npx eslint "src/**/*.ts" --max-warnings 0      # lint is NON-mutating; use `pnpm lint:fix` locally
npx jest --selectProjects unit --ci  # unit tests (coverage floors enforced in CI via test:cov)
pnpm test:e2e                        # e2e — needs the test stack (below), runs serially

# Mobile (apps/mobile)
npx tsc -p tsconfig.json --noEmit
npx eslint . --ext .ts,.tsx --max-warnings 0
npx jest --ci
```

Jest is split into `unit` and `e2e` projects in `apps/api/jest.config.js`; `pnpm test`
never touches e2e. Coverage thresholds are enforced (API 85/71/86/85, mobile 86/73/88/86
statements/branches/functions/lines) — if you add substantial untested code, the suite
goes red even when every test passes.

## E2E test stack

E2E suites hardcode Postgres `localhost:5437` (user `lilocharge` / password
`lilocharge_dev_password` / db `lilocharge_test`) and Redis `localhost:6382`.
With Docker: `docker compose -f infrastructure/docker/docker-compose.test.yml up -d`,
then `prisma migrate deploy` (or `db push`) and `pnpm test:e2e`.

**All e2e suites must pass together in one `--runInBand` run against a single reset
database.** Conventions that keep this true — follow them in any new suite:
- Run-unique user identities (`RUN_SUFFIX` phone/email pattern) so crashed or concurrent
  runs never collide on unique constraints.
- Per-suite cleanup in `beforeEach`, seeding your own fixtures only.
- Requests need a JWT matching the `:userId` path param (global `JwtAuthGuard` + `IdorGuard`);
  mint with `JwtService` (`{sub, email, tokenType: 'access'}`).
- Gateway-touching flows use a local `http.createServer` mock + `ARCA_BASE_URL` env
  (see `session-stop-receipt.e2e.spec.ts`), never real network.
- The auth suite overrides `ThrottlerStorage` in its TestingModule — production throttle
  config must never be weakened for tests.

## Sandboxed/remote environments (no Docker, restricted network)

Everything below was needed in a real session; expect to need it again.

- **Prisma engines**: `binaries.prisma.sh` downloads fail through some proxies, which
  breaks plain `pnpm install` (postinstall) and `prisma generate/db push/migrate`.
  Fix: `pnpm install --ignore-scripts`, download the two engine files for
  the pinned commit (see `node_modules/.pnpm/@prisma+engines-version…` for the hash;
  `https://binaries.prisma.sh/all_commits/<hash>/debian-openssl-3.0.x/{libquery_engine.so.node,schema-engine}.gz`
  usually IS reachable via curl), gunzip, then export
  `PRISMA_QUERY_ENGINE_LIBRARY=<path>/libquery_engine-….so.node` and
  `PRISMA_SCHEMA_ENGINE_BINARY=<path>/schema-engine-…` for every prisma CLI call.
- **No Docker / Docker Hub blocked**: run infra locally —
  `apt-get install postgresql-16-postgis-3` (TimescaleDB is usually NOT installable;
  use `prisma db push` instead of `migrate deploy` locally and apply
  `prisma/migrations/20260217154000_add_geospatial_entities/migration.sql` via psql
  for the location trigger), `initdb` + `pg_ctl -o "-p 5437"`, create the role/db/extensions
  (`postgis, pgcrypto, pg_trgm`), and `redis-server --port 6382 --daemonize yes`.
  DB reset between e2e attempts: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
  + re-create extensions + `db push` + the geo migration + `redis-cli flushall`.
- **k6 binaries unreachable** (dl.k6.io, GitHub releases, packages.grafana.com):
  use `apps/api/load-tests/autocannon-http-load.js` (autocannon comes from the npm
  registry, which is allowlisted). Raise the throttle for load runs with
  `LOADTEST_THROTTLE_LIMIT` — never in production.
- **Node TLS through the proxy**: export `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`
  (or the environment's CA bundle) when node scripts make HTTPS calls.

## Domain conventions the code depends on (violating these breaks tests or billing)

- **Money is integer AMD cents** everywhere (`totalCost`, wallet balances, pricing).
  Mobile renders with `formatAmdFromCents`.
- **OCPP**: a charge point's identity == `station.operatorId`; connectors resolve via
  evseId candidates `{chargePointId}-evse-{n}` / `{chargePointId}-{n}` / `{n}`
  (single builder — don't add copies). idTags are ≤20 chars, issued/resolved by
  `OcppIdTagService` (raw user UUIDs violate the OCPP 1.6 schema). Session energy bills
  the `meterStop − meterStart` register delta first, sampled meter values as fallback.
  1.6-J and 2.0.1 share the domain services; add protocol behavior in the routers,
  business logic in the shared services.
- **One session per connector** is enforced transactionally (SERIALIZABLE + P2034→409);
  every new session-creation path must go through or replicate that guard.
- **i18n**: every user-facing string in ALL THREE locale files
  (`apps/mobile/src/i18n/locales/{en,hy,ru}/common.json`); hy is default AND fallback,
  so a key missing from hy shows raw key text; the key-parity is typechecked via
  `typeof hyCommon`. Avoid `{{count}}` as an interpolation name (i18next pluralization).
- **Detox testIDs**: `src/testing/e2e-testid-guard.spec.ts` fails if a flow references
  a testID that doesn't exist in source — add testIDs with the flows that use them.
- **CI is pinned by tests**: `.github/workflows/*` contents are asserted by
  `apps/api/src/ci/workflows.spec.ts` — change them in tandem.

## Multi-agent execution (this repo was built/repaired by parallel agents)

- Partition by module ownership and say so in each agent's prompt (e.g. one owns
  `src/ocpp`, another `src/payments`); shared files (locale JSONs, app.module) will race —
  tell agents to re-read-and-retry on edit conflicts.
- Agents must NOT commit; the orchestrator reviews, runs full verification, and commits
  per workstream. Always re-run the FULL suites after the last agent lands — mid-flight
  states of concurrent agents make each agent's own "full run" unreliable.
- Verification bar for any change: tsc clean, eslint `--max-warnings 0` clean, unit
  suites green, e2e green if you touched anything the e2e exercises (sessions, ocpp,
  payments, wallet, auth), mobile tsc if you touched `packages/shared-types`
  (and rebuild its `dist` first).
- Background `pkill -f <pattern>` kills your own shell if the pattern appears in your
  command line — kill by PID or indirect the pattern.
