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
- **OCPP**: ocpp-rpc library for central system implementation
- **Payments**: ArCa (Armenian), Idram (Armenian), Apple Pay, Google Pay
- **Push**: Firebase Cloud Messaging (FCM)
- **i18n**: react-i18next with Armenian, Russian, English

## Repository Structure

```
/apps
  /api         - NestJS backend (Fastify adapter)
  /mobile      - React Native Expo app
/packages
  /shared-types    - TypeScript interfaces shared by api and mobile
  /shared-utils    - Common utilities (validation, formatting, etc.)
/infrastructure
  /docker          - docker-compose.yml for local dev
  /k8s             - Kubernetes manifests for production
/scripts           - Shell scripts for running PromptBook, deployment
/docs              - PRD, API specs, ADRs
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
- Integration tests: Supertest for API, React Native Testing Library for mobile
- E2E tests: Given/When/Then format
- Mock external services (payment gateways, OCPP charge points)
- Test file naming: `*.test.ts` or `*.spec.ts`

### Localization

- Default language: Armenian (hy)
- All user-facing strings in i18n files
- JSON structure: `{ "key": { "hy": "...", "ru": "...", "en": "..." } }`
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
