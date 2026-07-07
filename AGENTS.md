# AGENTS.md - LiloCharge AI Agent Instructions

## Core Principles

You are building **LiloCharge**, a production-grade EV charging aggregator for Armenia.
Every line of code must be:

- **Type-safe**: TypeScript strict mode, no `any`, no `@ts-ignore`
- **Tested**: Write tests FIRST (TDD), aim for >85% coverage on business logic
- **Documented**: JSDoc for public APIs, inline comments for complex logic
- **Consistent**: Follow existing patterns in the codebase religiously

## Tech Stack (Non-Negotiable)

- **Mobile**: React Native 0.74+ with Expo SDK 51+, Expo Router for navigation
- **Backend**: NestJS 10+ with Fastify adapter (NOT Express)
- **Database**: PostgreSQL 16 with PostGIS extension + TimescaleDB
- **Cache**: Redis 7+
- **ORM**: Prisma 5+ (declarative schema, type-safe queries)
- **Maps**: Mapbox GL Native (NOT Google Maps)
- **OCPP**: ocpp-rpc library for central system implementation (1.6-J full core + 2.0.1 core charging profile)
- **Payments**: ArCa (Armenian), Idram (Armenian), wallet. Apple Pay / Google Pay need a
  configured token-exchange service; native Pay modules are out of scope — fail loudly, never
  fake tokenization
- **Push**: Firebase Cloud Messaging (FCM)
- **i18n**: react-i18next with Armenian, Russian, English

## Repository Structure

```
/apps
  /api         - NestJS backend (Fastify adapter)
  /mobile      - React Native Expo app
/packages
  /shared-types    - TypeScript interfaces shared by api and mobile
/infrastructure
  /docker          - docker-compose.yml (dev) + docker-compose.test.yml (e2e stack)
  /k8s             - Kubernetes manifests for production
/scripts           - Security scan / production validation scripts
/docs              - PRD (prd.md), deployment guide, reports, privacy policy
```

## Coding Standards

### TypeScript

- Use `interface` for object shapes, `type` for unions/intersections
- Never use `any` - use `unknown` and type guards if truly dynamic
- Prefer `const` over `let`, never use `var`
- Use optional chaining `?.` and nullish coalescing `??`
- Always define return types for functions

### React Native / Expo

- Use functional components with hooks (no class components)
- Prefer `StyleSheet.create()` for styles
- Use Expo Router file-based routing (app/ directory)
- State management: Zustand for global state, useState for local
- API calls: React Query for server state
- Forms: React Hook Form with Zod validation

### NestJS Backend

- Organize by feature modules (e.g., `auth.module.ts`, `stations.module.ts`)
- Use dependency injection for all services
- DTOs for all request/response bodies (use class-validator decorators)
- Always use Fastify, never Express
- Database access ONLY via Prisma (no raw SQL unless absolutely necessary)
- All secrets via environment variables (never hardcoded)

### Prisma

- Define schema in `apps/api/prisma/schema.prisma`
- Use `@@map` for table names (snake_case in DB, camelCase in code)
- Use `@relation` for foreign keys with explicit names
- PostGIS types: use `Unsupported("geography(Point, 4326)")` for locations
- TimescaleDB hypertables: add via raw SQL in migration

### Testing

- Unit tests: Jest with `describe` / `it` / `expect`
- Integration tests: React Native Testing Library for mobile
- API jest is split into two projects: `pnpm --filter @lilocharge/api test` runs the hermetic
  `unit` project only; `pnpm --filter @lilocharge/api test:e2e` runs `*.e2e.spec.ts` serially
  and requires the test stack from `infrastructure/docker/docker-compose.test.yml` plus
  `prisma migrate deploy` (endpoints hardcoded to :5437/:6382 — recipe in that file's header)
- Mobile jest needs `@lilocharge/shared-types` built first on a fresh checkout
- Coverage floors are enforced in CI via `coverageThreshold` in each app's jest config —
  keep new code tested so the floors hold (current suites measure ~90% statements)
- Mock external services (payment gateways, OCPP charge points) in unit tests
- Test file naming: `*.test.ts` or `*.spec.ts` (`*.e2e.spec.ts` for API e2e)

### Localization

- Default language: Armenian (hy)
- All user-facing strings in i18n files
- Layout: one file per locale — `apps/mobile/src/i18n/locales/{hy,ru,en}/common.json`, each
  containing nested keys for that language only (e.g. `{ "tabs": { "stations": { "title": ... } } }`);
  add every new key to all three locales
- (Store metadata under `apps/mobile/store-assets/metadata` uses the per-key
  `{ "key": { "hy": ..., "ru": ..., "en": ... } }` shape instead — don't mix the two)
- Use Armenian-first design (all screenshots, examples in Armenian)

## Import Conventions

- Absolute imports for packages: `@lilocharge/shared-types`
- Relative imports within same package: `./services/auth.service`
- Group imports: external -> internal -> relative
- Sort imports alphabetically within groups

## Environment Variables

Backend (apps/api/.env):

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
ARCA_MERCHANT_ID=...
IDRAM_API_KEY=...
MAPBOX_TOKEN=...
FCM_SERVER_KEY=...
```

Mobile (apps/mobile/.env):

```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_MAPBOX_TOKEN=...
```

## Error Handling

- Backend: Use NestJS built-in exceptions (NotFoundException, BadRequestException, etc.)
- Mobile: Use React Error Boundaries for component errors, try/catch for async
- Always log errors with context (user ID, tenant ID, request ID)
- Never expose stack traces or sensitive data to end users

## Security

- Always validate input (use Zod schemas or class-validator DTOs)
- Never store raw payment card data (only tokenized payment methods)
- Hash passwords with bcrypt (rounds >= 12)
- Rate limit all public endpoints (use @nestjs/throttler)
- CORS: Whitelist only known origins
- Secrets rotation: Support env var changes without redeployment

## Performance

- API: Response time <200ms at P95
- Mobile: Time to interactive <2s on 3G
- Database: Index all foreign keys and frequently queried columns
- Redis caching: Cache station data for 5 minutes, connector status for 30 seconds
- Images: Compress to WebP, max 1MB per image
- Map: Use clustering for >100 markers

## When in Doubt

1. Read the PRD (`/docs/prd.md`) to understand requirements
2. Check existing code for patterns (never invent new patterns)
3. Consult Prisma schema for data model relationships
4. Follow NestJS documentation for module structure
5. Ask before making architecture changes
