# PromptBook-LiloCharge.md — Complete EV Charging Super-App for Armenia

> **Purpose:** Build LiloCharge from zero to production — a unified EV charging platform
> that aggregates all Armenian charging networks (9+ operators) into a single, transparent,
> frictionless mobile experience. Includes React Native mobile app, NestJS backend, OCPP
> integration, payment gateways (ArCa, Idram, Apple Pay, Google Pay), real-time session
> monitoring, community features, and tri-lingual support (Armenian, Russian, English).
>
> Tech Stack: React Native (Expo) + TypeScript | NestJS + Fastify | PostgreSQL + PostGIS +
> TimescaleDB | Redis | Prisma ORM | Mapbox | FCM | ocpp-rpc
>
> Executed by `scripts/run-promptbook-lilocharge.sh`
>
> **Section 1 (Steps 1-55):** Build prompts — infrastructure, packages, backend, mobile, integrations
> **Section 2 (Steps 56-75):** Test prompts — E2E flows, payment testing, OCPP simulation, production readiness

---

## Section 1: Build Steps

---

### Step 1: Monorepo Initialization and Project Structure

**Goal:** Initialize Turborepo monorepo with pnpm workspaces, ESLint, Prettier, TypeScript strict configuration, and complete folder structure for LiloCharge.

**Why:** LiloCharge follows a monorepo architecture to share code between React Native mobile app, NestJS backend, and shared packages. Turborepo enables fast, incremental builds optimized for AI agent development. This step creates the foundational structure that all subsequent steps will build upon.

````
Read AGENTS.md fully. You are the Infrastructure Agent initializing the LiloCharge monorepo.

CONTEXT:
This is step 1 of building LiloCharge from zero. No code exists yet. The project will be a
Turborepo monorepo with three main workspaces: apps (mobile, api), packages (shared-types,
shared-utils), and infrastructure (docker configs, scripts). The mobile app uses React Native
with Expo, the backend uses NestJS with Fastify, and shared packages enable type safety across
the stack.

The monorepo structure follows enterprise patterns optimized for AI coding agents:
- Strict TypeScript across all packages (no any, no ts-ignore)
- Consistent code style via ESLint and Prettier
- Shared configurations via workspace inheritance
- Fast, cached builds via Turbo pipeline configuration

This step creates the skeleton structure. Subsequent steps will populate each package with
actual implementation code.

REFERENCE FILES (read these first):
- NONE (this is step 1, no files exist yet)

BUILD:

1. INITIALIZE monorepo structure:
   Run from project root:
   ```bash
   pnpm init
   pnpm add -D -w turbo@latest
   pnpm add -D -w @turbo/gen@latest
````

CREATE file: package.json (root)

```json
{
  "name": "lilocharge",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "@turbo/gen": "^2.0.0",
    "typescript": "^5.4.0",
    "prettier": "^3.2.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.15.0"
}
```

2. CREATE workspace configuration:
   File: pnpm-workspace.yaml

   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```

3. CREATE Turborepo configuration:
   File: turbo.json

   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "globalDependencies": ["**/.env.*local"],
     "pipeline": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**", ".next/**", "build/**"]
       },
       "test": {
         "dependsOn": ["^build"],
         "outputs": ["coverage/**"]
       },
       "lint": {
         "outputs": []
       },
       "typecheck": {
         "dependsOn": ["^build"],
         "outputs": []
       },
       "dev": {
         "cache": false,
         "persistent": true
       },
       "clean": {
         "cache": false
       }
     }
   }
   ```

4. CREATE folder structure:

   ```bash
   mkdir -p apps/api apps/mobile
   mkdir -p packages/shared-types packages/shared-utils
   mkdir -p infrastructure/docker infrastructure/k8s
   mkdir -p scripts docs
   mkdir -p .github/workflows
   ```

5. CREATE root TypeScript configuration:
   File: tsconfig.json

   ```json
   {
     "$schema": "https://json.schemastore.org/tsconfig",
     "display": "Default",
     "compilerOptions": {
       "composite": false,
       "declaration": true,
       "declarationMap": true,
       "esModuleInterop": true,
       "forceConsistentCasingInFileNames": true,
       "inlineSources": false,
       "isolatedModules": true,
       "moduleResolution": "node",
       "noUnusedLocals": false,
       "noUnusedParameters": false,
       "preserveWatchOutput": true,
       "skipLibCheck": true,
       "strict": true,
       "strictNullChecks": true,
       "noImplicitAny": true,
       "noImplicitReturns": true,
       "noFallthroughCasesInSwitch": true
     },
     "exclude": ["node_modules"]
   }
   ```

6. CREATE ESLint configuration:
   File: .eslintrc.json

   ```json
   {
     "root": true,
     "extends": [
       "eslint:recommended",
       "plugin:@typescript-eslint/recommended",
       "plugin:@typescript-eslint/recommended-requiring-type-checking",
       "prettier"
     ],
     "parser": "@typescript-eslint/parser",
     "parserOptions": {
       "project": "./tsconfig.json"
     },
     "plugins": ["@typescript-eslint"],
     "rules": {
       "@typescript-eslint/no-explicit-any": "error",
       "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
       "@typescript-eslint/ban-ts-comment": "error",
       "no-console": ["warn", { "allow": ["warn", "error"] }]
     },
     "ignorePatterns": ["dist", "build", "coverage", "node_modules", "*.config.js"]
   }
   ```

7. CREATE Prettier configuration:
   File: .prettierrc.json

   ```json
   {
     "semi": true,
     "trailingComma": "all",
     "singleQuote": true,
     "printWidth": 100,
     "tabWidth": 2,
     "arrowParens": "always"
   }
   ```

8. CREATE .gitignore:
   File: .gitignore

   ```
   # Dependencies
   node_modules
   .pnp
   .pnp.js

   # Build outputs
   dist
   build
   .next
   .turbo

   # Environment
   .env
   .env.local
   .env.*.local

   # IDE
   .vscode
   .idea
   *.swp
   *.swo
   .DS_Store

   # Testing
   coverage

   # Logs
   *.log
   npm-debug.log*
   pnpm-debug.log*

   # Expo
   .expo
   .expo-shared

   # Android
   *.apk
   *.aab

   # iOS
   *.ipa
   ```

9. CREATE AGENTS.md (AI agent instructions):
   File: AGENTS.md

   ```markdown
   # AGENTS.md — LiloCharge AI Agent Instructions

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
   /api — NestJS backend (Fastify adapter)
   /mobile — React Native Expo app
   /packages
   /shared-types — TypeScript interfaces shared by api and mobile
   /shared-utils — Common utilities (validation, formatting, etc.)
   /infrastructure
   /docker — docker-compose.yml for local dev
   /k8s — Kubernetes manifests for production
   /scripts — Shell scripts for running PromptBook, deployment
   /docs — PRD, API specs, ADRs

   ```

   ## Coding Standards

   ### TypeScript
   - Use `interface` for object shapes, `type` for unions/intersections
   - Never use `any` — use `unknown` and type guards if truly dynamic
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
   - Group imports: external → internal → relative
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
   ```

10. CREATE .cursorrules (IDE-specific agent config):
    File: .cursorrules

    ```markdown
    # .cursorrules — Cursor IDE AI Agent Configuration

    ## Language and Framework Preferences

    - TypeScript strict mode for ALL files
    - React Native with Expo (SDK 51+)
    - NestJS with Fastify adapter
    - Prisma ORM for database access

    ## File Naming Conventions

    - React components: PascalCase (e.g., `StationMarker.tsx`)
    - Services/utilities: kebab-case (e.g., `payment-service.ts`)
    - Test files: Match source file with `.test.ts` or `.spec.ts`

    ## Code Generation Rules

    - Always add JSDoc comments for exported functions
    - Use named exports over default exports
    - Prefer function declarations over arrow functions for top-level components
    - Use `const` assertions for literal objects that won't change

    ## Imports

    - Use absolute imports for workspace packages: `@lilocharge/shared-types`
    - Use Expo's built-in aliases: `@/components`, `@/hooks`, `@/utils`

    ## Testing

    - Generate tests alongside implementation code
    - Use Given/When/Then format for integration tests
    - Mock external dependencies (OCPP, payment gateways)

    ## Armenian Language Support

    - Default all examples to Armenian language (hy)
    - UTF-8 encoding for all files
    - Test Armenian character rendering in all UI components
    ```

11. CREATE initial README:
    File: README.md

    ````markdown
    # LiloCharge — EV Charging Super-App for Armenia

    ![Version](https://img.shields.io/badge/version-1.0.0-blue)
    ![License](https://img.shields.io/badge/license-Proprietary-red)

    **Unified EV charging platform aggregating all Armenian charging networks into a single,
    transparent, frictionless mobile experience.**

    ## Features

    - 🗺️ **Universal Discovery**: Find all public charging stations across Armenia (9+ operators)
    - ⚡ **Real-Time Status**: Live availability with community-driven confidence scores
    - 💳 **Unified Payments**: ArCa, Idram, Apple Pay, Google Pay in one app
    - 📱 **Two-Tap Charging**: QR scan → confirm → start (fastest in market)
    - 🌍 **Tri-Lingual**: Armenian, Russian, English (Armenian-first design)
    - 👥 **Community Features**: Ratings, photos, problem reports
    - 🔌 **OCPP Integration**: Works with any OCPP 1.6-J or 2.0.1 compliant charger

    ## Tech Stack

    | Layer    | Technology                            |
    | -------- | ------------------------------------- |
    | Mobile   | React Native + Expo SDK 51            |
    | Backend  | NestJS + Fastify                      |
    | Database | PostgreSQL 16 + PostGIS + TimescaleDB |
    | Cache    | Redis 7                               |
    | ORM      | Prisma 5                              |
    | Maps     | Mapbox GL Native                      |
    | OCPP     | ocpp-rpc                              |
    | Payments | ArCa, Idram, Apple Pay, Google Pay    |
    | Push     | Firebase Cloud Messaging              |
    | i18n     | react-i18next                         |

    ## Quick Start

    ### Prerequisites

    - Node.js >= 18.0.0
    - pnpm >= 8.0.0
    - Docker >= 24.0.0
    - Expo CLI
    - Android Studio (for Android) or Xcode (for iOS)

    ### Installation

    ```bash
    # Install dependencies
    pnpm install

    # Start infrastructure (PostgreSQL, Redis, TimescaleDB)
    docker compose -f infrastructure/docker/docker-compose.yml up -d

    # Run database migrations
    pnpm --filter @lilocharge/api prisma migrate dev

    # Start backend
    pnpm --filter @lilocharge/api dev

    # Start mobile app (in separate terminal)
    pnpm --filter @lilocharge/mobile dev
    ```
    ````

    ## Project Structure

    ```
    lilocharge/
    ├── apps/
    │   ├── api/              # NestJS backend
    │   └── mobile/           # React Native Expo app
    ├── packages/
    │   ├── shared-types/     # TypeScript interfaces
    │   └── shared-utils/     # Common utilities
    ├── infrastructure/
    │   ├── docker/           # Docker Compose configs
    │   └── k8s/              # Kubernetes manifests
    ├── scripts/              # Deployment and utility scripts
    └── docs/                 # Documentation (PRD, ADRs, API specs)
    ```

    ## Documentation
    - [Product Requirements Document](docs/prd.md)
    - [API Documentation](docs/api/README.md)
    - [Architecture Decision Records](docs/adr/README.md)
    - [Deployment Guide](docs/deployment.md)
    - [Testing Guide](docs/testing.md)

    ## License

    Proprietary. All rights reserved.

    ```

    ```

12. INSTALL root dependencies:

    ```bash
    pnpm add -D -w eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier
    pnpm add -D -w jest @types/jest ts-jest
    ```

13. CREATE GitHub Actions workflow scaffold:
    File: .github/workflows/ci.yml

    ```yaml
    name: CI

    on:
      push:
        branches: [main, develop]
      pull_request:
        branches: [main, develop]

    jobs:
      lint:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v2
            with:
              version: 8
          - uses: actions/setup-node@v4
            with:
              node-version: 18
              cache: 'pnpm'
          - run: pnpm install
          - run: pnpm lint

      typecheck:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v2
            with:
              version: 8
          - uses: actions/setup-node@v4
            with:
              node-version: 18
              cache: 'pnpm'
          - run: pnpm install
          - run: pnpm typecheck

      test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v2
            with:
              version: 8
          - uses: actions/setup-node@v4
            with:
              node-version: 18
              cache: 'pnpm'
          - run: pnpm install
          - run: pnpm test
    ```

CONSTRAINTS:

- Use pnpm version 8.15.0 or higher (specified in package.json)
- Node version must be >= 18.0.0
- All packages must use TypeScript strict mode
- ESLint must error on `any`, `@ts-ignore`, unused vars
- Prettier must be configured to run before git commits
- Turborepo pipeline must cache build outputs for fast incremental builds
- GitHub Actions must run on every push and PR
- Never commit node_modules, .env files, or build artifacts

VALIDATION:

```bash
pnpm install
pnpm lint
pnpm typecheck
tree -L 2 -I node_modules  # Verify folder structure
```

DONE WHEN:

- `pnpm install` runs without errors
- `pnpm lint` passes (no files to lint yet, but command works)
- `pnpm typecheck` passes (no files to check yet, but command works)
- Folder structure matches expected layout (apps/, packages/, infrastructure/, scripts/, docs/)
- AGENTS.md and .cursorrules exist with complete instructions
- GitHub Actions workflow file exists
- README.md provides clear project overview

```

---

### Step 2: Shared Types Package — Core TypeScript Interfaces

**Goal:** Create @lilocharge/shared-types package with TypeScript interfaces for all data models (User, Vehicle, Station, Connector, Session, Payment, etc.) and API request/response types.

**Why:** The shared-types package is the single source of truth for TypeScript types across mobile and backend. Defining types first enables the mobile app to build UI against typed API contracts before backend implementation is complete. This follows the PRD's data model with 12 core entities.

```

Read AGENTS.md fully. You are the Types Agent building the @lilocharge/shared-types package.

CONTEXT:
This package contains all TypeScript interfaces and types used by both the mobile app and backend.
It is a workspace package that will be imported as `@lilocharge/shared-types` by other packages.
The types must match the Prisma schema that will be created in Step 4, but we're defining
TypeScript interfaces first to enable parallel development.

The PRD specifies 12 core entities: User, Vehicle, Station, Connector, PricingPlan, Session,
MeterValue, Payment, PaymentMethod, Review, Notification, AuditLog. We need TypeScript interfaces
for each, plus DTOs for API requests/responses, plus enums for status fields.

REFERENCE FILES (read these first):

- /AGENTS.md — TypeScript coding standards
- /docs/prd.md (from PRD Step) — Data model section (lines 219-350)

BUILD:

1. INITIALIZE shared-types package:
   File: packages/shared-types/package.json

   ```json
   {
     "name": "@lilocharge/shared-types",
     "version": "1.0.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "scripts": {
       "build": "tsc",
       "dev": "tsc --watch",
       "clean": "rm -rf dist",
       "typecheck": "tsc --noEmit",
       "test": "echo 'No tests for types package' && exit 0"
     },
     "devDependencies": {
       "typescript": "^5.4.0"
     },
     "dependencies": {
       "zod": "^3.22.0"
     }
   }
   ```

2. CREATE TypeScript config for this package:
   File: packages/shared-types/tsconfig.json

   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "declaration": true,
       "declarationMap": true
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. CREATE User types:
   File: packages/shared-types/src/user.ts

   ```typescript
   import { z } from 'zod';

   export interface User {
     id: string;
     email: string;
     phone: string | null;
     displayName: string;
     language: 'hy' | 'ru' | 'en';
     createdAt: Date;
     updatedAt: Date;
   }

   export const userSchema = z.object({
     id: z.string().uuid(),
     email: z.string().email(),
     phone: z.string().nullable(),
     displayName: z.string().min(1).max(255),
     language: z.enum(['hy', 'ru', 'en']),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export interface CreateUserRequest {
     email: string;
     password: string;
     phone?: string;
     displayName: string;
     language?: 'hy' | 'ru' | 'en';
   }

   export const createUserRequestSchema = z.object({
     email: z.string().email(),
     password: z.string().min(8),
     phone: z.string().optional(),
     displayName: z.string().min(1).max(255),
     language: z.enum(['hy', 'ru', 'en']).default('hy'),
   });

   export interface UpdateUserRequest {
     displayName?: string;
     language?: 'hy' | 'ru' | 'en';
     phone?: string;
   }

   export const updateUserRequestSchema = z.object({
     displayName: z.string().min(1).max(255).optional(),
     language: z.enum(['hy', 'ru', 'en']).optional(),
     phone: z.string().optional(),
   });
   ```

4. CREATE Vehicle types:
   File: packages/shared-types/src/vehicle.ts

   ```typescript
   import { z } from 'zod';

   export enum ConnectorType {
     TYPE_1 = 'TYPE_1',
     TYPE_2 = 'TYPE_2',
     CCS = 'CCS',
     CHADEMO = 'CHADEMO',
     TESLA = 'TESLA',
     GBT = 'GBT',
   }

   export interface Vehicle {
     id: string;
     userId: string;
     make: string;
     model: string;
     year: number;
     connectorType: ConnectorType;
     batteryCapacity: number; // kWh
     maxChargePower: number; // kW
     createdAt: Date;
     updatedAt: Date;
   }

   export const vehicleSchema = z.object({
     id: z.string().uuid(),
     userId: z.string().uuid(),
     make: z.string().min(1).max(100),
     model: z.string().min(1).max(100),
     year: z.number().int().min(2010).max(2030),
     connectorType: z.nativeEnum(ConnectorType),
     batteryCapacity: z.number().positive(),
     maxChargePower: z.number().positive(),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export interface CreateVehicleRequest {
     make: string;
     model: string;
     year: number;
     connectorType: ConnectorType;
     batteryCapacity: number;
     maxChargePower: number;
   }

   export const createVehicleRequestSchema = z.object({
     make: z.string().min(1).max(100),
     model: z.string().min(1).max(100),
     year: z.number().int().min(2010).max(2030),
     connectorType: z.nativeEnum(ConnectorType),
     batteryCapacity: z.number().positive(),
     maxChargePower: z.number().positive(),
   });
   ```

5. CREATE Station and Connector types:
   File: packages/shared-types/src/station.ts

   ```typescript
   import { z } from 'zod';
   import { ConnectorType } from './vehicle';

   export enum StationStatus {
     AVAILABLE = 'AVAILABLE',
     OCCUPIED = 'OCCUPIED',
     OFFLINE = 'OFFLINE',
     MAINTENANCE = 'MAINTENANCE',
   }

   export interface Station {
     id: string;
     operatorId: string;
     operatorName: string;
     name: string;
     address: string;
     city: string;
     latitude: number;
     longitude: number;
     status: StationStatus;
     openingHours: string | null;
     amenities: string[];
     createdAt: Date;
     updatedAt: Date;
   }

   export interface Connector {
     id: string;
     stationId: string;
     evseId: string;
     connectorType: ConnectorType;
     powerKw: number;
     status: StationStatus;
     pricePerKwh: number | null;
     pricePerMinute: number | null;
     sessionFee: number | null;
     lastStatusUpdate: Date;
   }

   export const stationSchema = z.object({
     id: z.string().uuid(),
     operatorId: z.string(),
     operatorName: z.string(),
     name: z.string().min(1).max(255),
     address: z.string().min(1).max(500),
     city: z.string().min(1).max(100),
     latitude: z.number().min(-90).max(90),
     longitude: z.number().min(-180).max(180),
     status: z.nativeEnum(StationStatus),
     openingHours: z.string().nullable(),
     amenities: z.array(z.string()),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export const connectorSchema = z.object({
     id: z.string().uuid(),
     stationId: z.string().uuid(),
     evseId: z.string(),
     connectorType: z.nativeEnum(ConnectorType),
     powerKw: z.number().positive(),
     status: z.nativeEnum(StationStatus),
     pricePerKwh: z.number().nonnegative().nullable(),
     pricePerMinute: z.number().nonnegative().nullable(),
     sessionFee: z.number().nonnegative().nullable(),
     lastStatusUpdate: z.date(),
   });

   export interface StationWithConnectors extends Station {
     connectors: Connector[];
     distance?: number; // meters, populated by geospatial query
   }

   export interface StationSearchParams {
     latitude: number;
     longitude: number;
     radius: number; // meters
     connectorType?: ConnectorType;
     minPowerKw?: number;
     operatorId?: string;
   }

   export const stationSearchParamsSchema = z.object({
     latitude: z.number().min(-90).max(90),
     longitude: z.number().min(-180).max(180),
     radius: z.number().positive().max(50000), // max 50km
     connectorType: z.nativeEnum(ConnectorType).optional(),
     minPowerKw: z.number().positive().optional(),
     operatorId: z.string().optional(),
   });
   ```

6. CREATE Session types:
   File: packages/shared-types/src/session.ts

   ```typescript
   import { z } from 'zod';

   export enum SessionStatus {
     PENDING = 'PENDING',
     AUTHORIZED = 'AUTHORIZED',
     ACTIVE = 'ACTIVE',
     COMPLETED = 'COMPLETED',
     FAILED = 'FAILED',
     CANCELLED = 'CANCELLED',
   }

   export interface Session {
     id: string;
     userId: string;
     connectorId: string;
     vehicleId: string | null;
     status: SessionStatus;
     startTime: Date | null;
     endTime: Date | null;
     energyDelivered: number; // kWh
     peakPower: number; // kW
     totalCost: number; // AMD (Armenian Dram)
     transactionId: string | null;
     createdAt: Date;
     updatedAt: Date;
   }

   export const sessionSchema = z.object({
     id: z.string().uuid(),
     userId: z.string().uuid(),
     connectorId: z.string().uuid(),
     vehicleId: z.string().uuid().nullable(),
     status: z.nativeEnum(SessionStatus),
     startTime: z.date().nullable(),
     endTime: z.date().nullable(),
     energyDelivered: z.number().nonnegative(),
     peakPower: z.number().nonnegative(),
     totalCost: z.number().nonnegative(),
     transactionId: z.string().nullable(),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export interface MeterValue {
     id: string;
     sessionId: string;
     timestamp: Date;
     energyActiveImport: number; // Wh
     powerActiveImport: number; // W
     currentImport: number; // A
     voltage: number; // V
     soc: number | null; // State of charge (0-100)
   }

   export const meterValueSchema = z.object({
     id: z.string().uuid(),
     sessionId: z.string().uuid(),
     timestamp: z.date(),
     energyActiveImport: z.number().nonnegative(),
     powerActiveImport: z.number().nonnegative(),
     currentImport: z.number().nonnegative(),
     voltage: z.number().positive(),
     soc: z.number().min(0).max(100).nullable(),
   });

   export interface StartSessionRequest {
     connectorId: string;
     vehicleId?: string;
     paymentMethodId: string;
   }

   export const startSessionRequestSchema = z.object({
     connectorId: z.string().uuid(),
     vehicleId: z.string().uuid().optional(),
     paymentMethodId: z.string().uuid(),
   });

   export interface StopSessionRequest {
     sessionId: string;
   }

   export const stopSessionRequestSchema = z.object({
     sessionId: z.string().uuid(),
   });
   ```

7. CREATE Payment types:
   File: packages/shared-types/src/payment.ts

   ```typescript
   import { z } from 'zod';

   export enum PaymentGateway {
     ARCA = 'ARCA',
     IDRAM = 'IDRAM',
     APPLE_PAY = 'APPLE_PAY',
     GOOGLE_PAY = 'GOOGLE_PAY',
     WALLET = 'WALLET',
   }

   export enum PaymentStatus {
     PENDING = 'PENDING',
     AUTHORIZED = 'AUTHORIZED',
     CAPTURED = 'CAPTURED',
     FAILED = 'FAILED',
     REFUNDED = 'REFUNDED',
   }

   export interface PaymentMethod {
     id: string;
     userId: string;
     gateway: PaymentGateway;
     token: string; // tokenized payment method (never raw card data)
     last4: string | null;
     expiryMonth: number | null;
     expiryYear: number | null;
     isDefault: boolean;
     createdAt: Date;
     updatedAt: Date;
   }

   export const paymentMethodSchema = z.object({
     id: z.string().uuid(),
     userId: z.string().uuid(),
     gateway: z.nativeEnum(PaymentGateway),
     token: z.string(),
     last4: z.string().length(4).nullable(),
     expiryMonth: z.number().int().min(1).max(12).nullable(),
     expiryYear: z.number().int().min(2024).nullable(),
     isDefault: z.boolean(),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export interface Payment {
     id: string;
     sessionId: string;
     userId: string;
     paymentMethodId: string;
     gateway: PaymentGateway;
     status: PaymentStatus;
     amount: number; // AMD
     authorizedAmount: number; // AMD
     capturedAmount: number; // AMD
     gatewayTransactionId: string | null;
     createdAt: Date;
     updatedAt: Date;
   }

   export const paymentSchema = z.object({
     id: z.string().uuid(),
     sessionId: z.string().uuid(),
     userId: z.string().uuid(),
     paymentMethodId: z.string().uuid(),
     gateway: z.nativeEnum(PaymentGateway),
     status: z.nativeEnum(PaymentStatus),
     amount: z.number().nonnegative(),
     authorizedAmount: z.number().nonnegative(),
     capturedAmount: z.number().nonnegative(),
     gatewayTransactionId: z.string().nullable(),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export interface CreatePaymentMethodRequest {
     gateway: PaymentGateway;
     token: string;
     last4?: string;
     expiryMonth?: number;
     expiryYear?: number;
   }

   export const createPaymentMethodRequestSchema = z.object({
     gateway: z.nativeEnum(PaymentGateway),
     token: z.string(),
     last4: z.string().length(4).optional(),
     expiryMonth: z.number().int().min(1).max(12).optional(),
     expiryYear: z.number().int().min(2024).optional(),
   });
   ```

8. CREATE Review types:
   File: packages/shared-types/src/review.ts

   ```typescript
   import { z } from 'zod';

   export interface Review {
     id: string;
     stationId: string;
     userId: string;
     rating: number; // 1-5
     comment: string | null;
     photos: string[]; // URLs to uploaded photos
     createdAt: Date;
     updatedAt: Date;
   }

   export const reviewSchema = z.object({
     id: z.string().uuid(),
     stationId: z.string().uuid(),
     userId: z.string().uuid(),
     rating: z.number().int().min(1).max(5),
     comment: z.string().max(1000).nullable(),
     photos: z.array(z.string().url()),
     createdAt: z.date(),
     updatedAt: z.date(),
   });

   export interface CreateReviewRequest {
     stationId: string;
     rating: number;
     comment?: string;
     photos?: string[];
   }

   export const createReviewRequestSchema = z.object({
     stationId: z.string().uuid(),
     rating: z.number().int().min(1).max(5),
     comment: z.string().max(1000).optional(),
     photos: z.array(z.string().url()).max(5).optional(),
   });
   ```

9. CREATE OCPP message types:
   File: packages/shared-types/src/ocpp.ts

   ```typescript
   // OCPP 1.6-J and 2.0.1 message types

   export enum OCPPAction {
     // OCPP 1.6-J
     BOOT_NOTIFICATION = 'BootNotification',
     HEARTBEAT = 'Heartbeat',
     STATUS_NOTIFICATION = 'StatusNotification',
     METER_VALUES = 'MeterValues',
     START_TRANSACTION = 'StartTransaction',
     STOP_TRANSACTION = 'StopTransaction',
     REMOTE_START_TRANSACTION = 'RemoteStartTransaction',
     REMOTE_STOP_TRANSACTION = 'RemoteStopTransaction',
     // OCPP 2.0.1
     TRANSACTION_EVENT = 'TransactionEvent',
   }

   export interface OCPPBootNotification {
     chargePointVendor: string;
     chargePointModel: string;
     chargePointSerialNumber?: string;
     chargeBoxSerialNumber?: string;
     firmwareVersion?: string;
   }

   export interface OCPPStatusNotification {
     connectorId: number;
     status:
       | 'Available'
       | 'Preparing'
       | 'Charging'
       | 'SuspendedEVSE'
       | 'SuspendedEV'
       | 'Finishing'
       | 'Reserved'
       | 'Unavailable'
       | 'Faulted';
     errorCode:
       | 'NoError'
       | 'ConnectorLockFailure'
       | 'EVCommunicationError'
       | 'GroundFailure'
       | 'HighTemperature'
       | 'InternalError'
       | 'LocalListConflict'
       | 'OtherError'
       | 'OverCurrentFailure'
       | 'PowerMeterFailure'
       | 'PowerSwitchFailure'
       | 'ReaderFailure'
       | 'ResetFailure'
       | 'UnderVoltage'
       | 'OverVoltage'
       | 'WeakSignal';
     timestamp?: string;
   }

   export interface OCPPMeterValues {
     connectorId: number;
     transactionId?: number;
     meterValue: Array<{
       timestamp: string;
       sampledValue: Array<{
         value: string;
         context?: 'Sample.Periodic' | 'Sample.Clock' | 'Transaction.Begin' | 'Transaction.End';
         measurand?:
           | 'Energy.Active.Import.Register'
           | 'Power.Active.Import'
           | 'Current.Import'
           | 'Voltage'
           | 'SoC';
         unit?: 'Wh' | 'kWh' | 'W' | 'kW' | 'A' | 'V' | 'Percent';
       }>;
     }>;
   }

   export interface OCPPRemoteStartTransaction {
     connectorId: number;
     idTag: string; // User identifier
   }

   export interface OCPPRemoteStopTransaction {
     transactionId: number;
   }
   ```

10. CREATE barrel export:
    File: packages/shared-types/src/index.ts

    ```typescript
    export * from './user';
    export * from './vehicle';
    export * from './station';
    export * from './session';
    export * from './payment';
    export * from './review';
    export * from './ocpp';
    ```

11. ADD tests for schemas:
    File: packages/shared-types/src/user.test.ts

    ```typescript
    import { describe, it, expect } from '@jest/globals';
    import { createUserRequestSchema, updateUserRequestSchema } from './user';

    describe('User Schemas', () => {
      describe('createUserRequestSchema', () => {
        it('validates valid user creation request', () => {
          const validData = {
            email: 'test@example.com',
            password: 'SecurePass123!',
            displayName: 'Test User',
            language: 'hy' as const,
          };

          const result = createUserRequestSchema.safeParse(validData);
          expect(result.success).toBe(true);
        });

        it('rejects invalid email', () => {
          const invalidData = {
            email: 'not-an-email',
            password: 'SecurePass123!',
            displayName: 'Test User',
          };

          const result = createUserRequestSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
        });

        it('rejects short password', () => {
          const invalidData = {
            email: 'test@example.com',
            password: 'short',
            displayName: 'Test User',
          };

          const result = createUserRequestSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
        });

        it('defaults to Armenian language', () => {
          const data = {
            email: 'test@example.com',
            password: 'SecurePass123!',
            displayName: 'Test User',
          };

          const result = createUserRequestSchema.parse(data);
          expect(result.language).toBe('hy');
        });
      });
    });
    ```

12. ADD tests for station schemas:
    File: packages/shared-types/src/station.test.ts

    ```typescript
    import { describe, it, expect } from '@jest/globals';
    import { stationSearchParamsSchema } from './station';
    import { ConnectorType } from './vehicle';

    describe('Station Schemas', () => {
      describe('stationSearchParamsSchema', () => {
        it('validates valid search params', () => {
          const validData = {
            latitude: 40.1872,
            longitude: 44.5152,
            radius: 5000,
          };

          const result = stationSearchParamsSchema.safeParse(validData);
          expect(result.success).toBe(true);
        });

        it('rejects radius > 50km', () => {
          const invalidData = {
            latitude: 40.1872,
            longitude: 44.5152,
            radius: 60000,
          };

          const result = stationSearchParamsSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
        });

        it('accepts optional connector type filter', () => {
          const validData = {
            latitude: 40.1872,
            longitude: 44.5152,
            radius: 5000,
            connectorType: ConnectorType.CCS,
          };

          const result = stationSearchParamsSchema.safeParse(validData);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.connectorType).toBe(ConnectorType.CCS);
          }
        });
      });
    });
    ```

CONSTRAINTS:

- All interfaces must be exported
- All enums must use string values (not numeric) for API compatibility
- Zod schemas must match TypeScript interfaces exactly
- Never use `any` type — use `unknown` if truly dynamic
- Currency amounts always in Armenian Dram (AMD), never other currencies
- Dates must be `Date` objects (not strings) in TypeScript, ISO 8601 strings in JSON
- UUIDs for all primary keys
- Geospatial coordinates: latitude -90 to 90, longitude -180 to 180
- Phone numbers stored as strings (international format with country code)
- Passwords never stored in types (only in creation requests)
- Payment tokens never expire in types (expiry handled by gateway)

VALIDATION:

```bash
cd packages/shared-types
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

DONE WHEN:

- Package builds without TypeScript errors
- All Zod schemas validate correctly
- All tests pass
- Barrel export includes all type files
- Types are importable as `@lilocharge/shared-types`
- No `any` types, no `@ts-ignore` comments

```

---

### Step 3: Database Infrastructure — Docker Compose Setup

**Goal:** Create docker-compose.yml for PostgreSQL 16 with PostGIS and TimescaleDB extensions, Redis 7, and pgAdmin for local development.

**Why:** The backend requires PostgreSQL with PostGIS for geospatial queries (nearby station search) and TimescaleDB for time-series meter value data. Redis provides caching for station status and session data. This step creates the complete database infrastructure that Steps 4-6 will configure.

```

Read AGENTS.md fully. You are the Infrastructure Agent setting up the local development database stack.

CONTEXT:
LiloCharge uses PostgreSQL 16 as the primary database with two critical extensions:

1. PostGIS for geospatial queries (ST_DWithin for nearby station search)
2. TimescaleDB for time-series meter value storage (1Hz sampling during charging)

Redis is used for caching connector status (30s TTL), station data (5min TTL), and session
state during active charging. pgAdmin provides a web UI for database inspection during development.

All services run via Docker Compose for consistent local development. Production will use managed
PostgreSQL (e.g., AWS RDS with PostGIS) and managed Redis (e.g., AWS ElastiCache), but the same
schema and queries will work identically.

REFERENCE FILES (read these first):

- /AGENTS.md — Infrastructure coding standards
- /docs/prd.md — Database requirements (lines 219-250)

BUILD:

1. CREATE docker-compose.yml:
   File: infrastructure/docker/docker-compose.yml

   ```yaml
   version: '3.8'

   services:
     postgres:
       image: timescale/timescaledb-ha:pg16-latest
       container_name: lilocharge-postgres
       ports:
         - '5432:5432'
       environment:
         POSTGRES_USER: lilocharge
         POSTGRES_PASSWORD: lilocharge_dev_password
         POSTGRES_DB: lilocharge
       volumes:
         - postgres_data:/var/lib/postgresql/data
         - ./init-db:/docker-entrypoint-initdb.d
       healthcheck:
         test: ['CMD-SHELL', 'pg_isready -U lilocharge']
         interval: 10s
         timeout: 5s
         retries: 5
       networks:
         - lilocharge-network

     redis:
       image: redis:7-alpine
       container_name: lilocharge-redis
       ports:
         - '6379:6379'
       command: redis-server --requirepass lilocharge_redis_password --maxmemory 256mb --maxmemory-policy allkeys-lru
       volumes:
         - redis_data:/data
       healthcheck:
         test: ['CMD', 'redis-cli', '--raw', 'incr', 'ping']
         interval: 10s
         timeout: 5s
         retries: 5
       networks:
         - lilocharge-network

     pgadmin:
       image: dpage/pgadmin4:latest
       container_name: lilocharge-pgadmin
       ports:
         - '5050:80'
       environment:
         PGADMIN_DEFAULT_EMAIL: admin@lilocharge.local
         PGADMIN_DEFAULT_PASSWORD: admin
         PGADMIN_CONFIG_SERVER_MODE: 'False'
       volumes:
         - pgadmin_data:/var/lib/pgadmin
       depends_on:
         - postgres
       networks:
         - lilocharge-network

   networks:
     lilocharge-network:
       driver: bridge

   volumes:
     postgres_data:
     redis_data:
     pgadmin_data:
   ```

2. CREATE database initialization script:
   File: infrastructure/docker/init-db/01-enable-extensions.sql

   ```sql
   -- Enable PostGIS extension for geospatial queries
   CREATE EXTENSION IF NOT EXISTS postgis;

   -- Enable TimescaleDB extension for time-series data
   CREATE EXTENSION IF NOT EXISTS timescaledb;

   -- Enable pgcrypto for UUID generation
   CREATE EXTENSION IF NOT EXISTS pgcrypto;

   -- Enable pg_trgm for fuzzy text search (Armenian station names)
   CREATE EXTENSION IF NOT EXISTS pg_trgm;

   -- Verify extensions
   SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis', 'timescaledb', 'pgcrypto', 'pg_trgm');
   ```

3. CREATE .env.example for database credentials:
   File: infrastructure/docker/.env.example

   ```env
   # PostgreSQL
   POSTGRES_USER=lilocharge
   POSTGRES_PASSWORD=lilocharge_dev_password
   POSTGRES_DB=lilocharge
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=lilocharge_redis_password

   # Database URL (for Prisma)
   DATABASE_URL=postgresql://lilocharge:lilocharge_dev_password@localhost:5432/lilocharge

   # Redis URL (for backend)
   REDIS_URL=redis://:lilocharge_redis_password@localhost:6379
   ```

4. CREATE README for infrastructure:
   File: infrastructure/docker/README.md

   ````markdown
   # LiloCharge Infrastructure — Local Development

   ## Services

   - **PostgreSQL 16** with PostGIS and TimescaleDB on port 5432
   - **Redis 7** on port 6379
   - **pgAdmin 4** on port 5050 (http://localhost:5050)

   ## Quick Start

   ```bash
   # Start all services
   docker compose up -d

   # Check service health
   docker compose ps

   # View logs
   docker compose logs -f

   # Stop all services
   docker compose down

   # Stop and remove volumes (CAUTION: deletes all data)
   docker compose down -v
   ```
   ````

   ## Database Access

   ### Via psql CLI

   ```bash
   docker exec -it lilocharge-postgres psql -U lilocharge -d lilocharge
   ```

   ### Via pgAdmin
   1. Open http://localhost:5050
   2. Login: admin@lilocharge.local / admin
   3. Add Server:
      - Name: LiloCharge Local
      - Host: postgres (use service name, not localhost)
      - Port: 5432
      - Username: lilocharge
      - Password: lilocharge_dev_password

   ### Via Application

   ```env
   DATABASE_URL=postgresql://lilocharge:lilocharge_dev_password@localhost:5432/lilocharge
   ```

   ## Redis Access

   ### Via redis-cli

   ```bash
   docker exec -it lilocharge-redis redis-cli -a lilocharge_redis_password
   ```

   ### Via Application

   ```env
   REDIS_URL=redis://:lilocharge_redis_password@localhost:6379
   ```

   ## Extensions Installed
   - **postgis**: Geospatial queries (ST_DWithin, ST_Distance)
   - **timescaledb**: Time-series hypertables for meter values
   - **pgcrypto**: UUID generation (gen_random_uuid())
   - **pg_trgm**: Fuzzy text search for Armenian station names

   ## Troubleshooting

   ### Port already in use

   ```bash
   # Check what's using port 5432
   lsof -i :5432

   # Stop existing PostgreSQL service
   brew services stop postgresql  # macOS
   sudo systemctl stop postgresql  # Linux
   ```

   ### Cannot connect to database

   ```bash
   # Check if container is running
   docker ps | grep lilocharge-postgres

   # Check container logs
   docker logs lilocharge-postgres

   # Restart container
   docker compose restart postgres
   ```

   ### PostGIS or TimescaleDB not working

   ```bash
   # Verify extensions
   docker exec -it lilocharge-postgres psql -U lilocharge -d lilocharge -c "SELECT extname, extversion FROM pg_extension;"

   # Re-run init script
   docker exec -it lilocharge-postgres psql -U lilocharge -d lilocharge -f /docker-entrypoint-initdb.d/01-enable-extensions.sql
   ```

   ```

   ```

5. CREATE startup verification script:
   File: scripts/verify-infrastructure.sh

   ```bash
   #!/bin/bash

   set -e

   echo "🔍 Verifying LiloCharge infrastructure..."

   # Check Docker is running
   if ! docker info > /dev/null 2>&1; then
     echo "❌ Docker is not running. Start Docker Desktop and try again."
     exit 1
   fi

   # Check if containers are running
   if ! docker compose -f infrastructure/docker/docker-compose.yml ps | grep -q "Up"; then
     echo "⚠️  Containers not running. Starting infrastructure..."
     docker compose -f infrastructure/docker/docker-compose.yml up -d
     sleep 5
   fi

   # Wait for PostgreSQL to be healthy
   echo "⏳ Waiting for PostgreSQL..."
   timeout 30s bash -c 'until docker exec lilocharge-postgres pg_isready -U lilocharge; do sleep 1; done'

   # Verify PostGIS extension
   echo "🗺️  Verifying PostGIS..."
   docker exec lilocharge-postgres psql -U lilocharge -d lilocharge -c "SELECT PostGIS_Version();" | grep -q "POSTGIS"

   # Verify TimescaleDB extension
   echo "⏰ Verifying TimescaleDB..."
   docker exec lilocharge-postgres psql -U lilocharge -d lilocharge -c "SELECT extversion FROM pg_extension WHERE extname='timescaledb';" | grep -q "2\."

   # Wait for Redis to be healthy
   echo "⏳ Waiting for Redis..."
   timeout 30s bash -c 'until docker exec lilocharge-redis redis-cli -a lilocharge_redis_password ping | grep -q PONG; do sleep 1; done'

   echo "✅ Infrastructure is ready!"
   echo ""
   echo "PostgreSQL: postgresql://lilocharge:lilocharge_dev_password@localhost:5432/lilocharge"
   echo "Redis:      redis://:lilocharge_redis_password@localhost:6379"
   echo "pgAdmin:    http://localhost:5050 (admin@lilocharge.local / admin)"
   ```

   Make executable:

   ```bash
   chmod +x scripts/verify-infrastructure.sh
   ```

6. UPDATE root README with infrastructure instructions:
   File: README.md (add section after Quick Start)

   ````markdown
   ## Infrastructure Setup

   LiloCharge requires PostgreSQL with PostGIS and TimescaleDB, plus Redis. Use Docker Compose for local development:

   ```bash
   # Start infrastructure
   docker compose -f infrastructure/docker/docker-compose.yml up -d

   # Verify all services are healthy
   ./scripts/verify-infrastructure.sh

   # View logs
   docker compose -f infrastructure/docker/docker-compose.yml logs -f
   ```
   ````

   Access services:
   - **PostgreSQL**: localhost:5432 (user: lilocharge, password: lilocharge_dev_password)
   - **Redis**: localhost:6379 (password: lilocharge_redis_password)
   - **pgAdmin**: http://localhost:5050 (admin@lilocharge.local / admin)

   ```

   ```

CONSTRAINTS:

- PostgreSQL must use TimescaleDB image (includes PostGIS compatibility)
- Redis must enforce password authentication (no anonymous access)
- All passwords must be different from production (these are dev-only credentials)
- Init script must be idempotent (CREATE EXTENSION IF NOT EXISTS)
- Health checks must pass before application can connect
- Volumes must persist data across container restarts
- pgAdmin config must allow saving server connections
- Network must isolate services from other Docker projects

VALIDATION:

```bash
cd infrastructure/docker
docker compose up -d
docker compose ps  # All services should show "Up (healthy)"
./scripts/verify-infrastructure.sh  # Should print "✅ Infrastructure is ready!"
docker exec lilocharge-postgres psql -U lilocharge -d lilocharge -c "SELECT PostGIS_Version();"
docker exec lilocharge-redis redis-cli -a lilocharge_redis_password PING  # Should return "PONG"
```

DONE WHEN:

- Docker Compose starts all three services successfully
- PostgreSQL is accessible on localhost:5432
- PostGIS and TimescaleDB extensions are installed
- Redis is accessible on localhost:6379 with password auth
- pgAdmin is accessible at http://localhost:5050
- Verify script passes all checks
- Volumes persist data after `docker compose restart`

```

---

### Step 4: Prisma Schema — Core Entities (User, Vehicle, Payment)

**Goal:** Create Prisma schema with User, Vehicle, PaymentMethod, and Payment entities, configure PostgreSQL connection, and run initial migration.

**Why:** Prisma is the ORM for the NestJS backend. The schema must be defined before any backend modules can perform database operations. This step creates the first 4 entities, leaving Station/Connector and Session/MeterValue for subsequent steps to keep migrations focused and atomic.

```

Read AGENTS.md fully. You are the Database Agent creating the Prisma schema for core LiloCharge entities.

CONTEXT:
Prisma will be used exclusively for all database access in the NestJS backend. The schema lives
in apps/api/prisma/schema.prisma and serves as the single source of truth for the data model.
Prisma generates TypeScript types automatically, which must match the interfaces in @lilocharge/shared-types.

This step creates User, Vehicle, PaymentMethod, and Payment entities. These are prerequisite
entities that don't depend on Station or Session (which will be added in Steps 5-6). Breaking
the schema into multiple steps keeps migrations small and reviewable.

The PostgreSQL database is already running (Step 3) with PostGIS and TimescaleDB extensions
enabled. Prisma doesn't natively support PostGIS geography types, so we'll use Unsupported()
for location fields and access them via raw SQL when needed.

REFERENCE FILES (read these first):

- /AGENTS.md — Database coding standards
- /packages/shared-types/src/user.ts — TypeScript interfaces to match
- /packages/shared-types/src/vehicle.ts — Vehicle and ConnectorType enum
- /packages/shared-types/src/payment.ts — Payment types
- /infrastructure/docker/.env.example — DATABASE_URL format

BUILD:

1. INITIALIZE Prisma in api package:
   File: apps/api/package.json

   ```json
   {
     "name": "@lilocharge/api",
     "version": "1.0.0",
     "private": true,
     "scripts": {
       "build": "nest build",
       "dev": "nest start --watch",
       "start": "nest start",
       "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
       "test": "jest",
       "test:watch": "jest --watch",
       "test:cov": "jest --coverage",
       "typecheck": "tsc --noEmit",
       "prisma:generate": "prisma generate",
       "prisma:migrate": "prisma migrate dev",
       "prisma:studio": "prisma studio",
       "prisma:seed": "ts-node prisma/seed.ts"
     },
     "dependencies": {
       "@nestjs/common": "^10.3.0",
       "@nestjs/core": "^10.3.0",
       "@nestjs/platform-fastify": "^10.3.0",
       "@fastify/cookie": "^9.3.0",
       "@fastify/cors": "^9.0.1",
       "@prisma/client": "^5.10.0",
       "bcrypt": "^5.1.1",
       "class-validator": "^0.14.1",
       "class-transformer": "^0.5.1",
       "zod": "^3.22.0",
       "@lilocharge/shared-types": "workspace:*"
     },
     "devDependencies": {
       "@nestjs/cli": "^10.3.0",
       "@nestjs/schematics": "^10.1.0",
       "@nestjs/testing": "^10.3.0",
       "@types/bcrypt": "^5.0.2",
       "@types/jest": "^29.5.0",
       "@types/node": "^20.11.0",
       "jest": "^29.7.0",
       "prisma": "^5.10.0",
       "ts-jest": "^29.1.0",
       "ts-node": "^10.9.0",
       "typescript": "^5.4.0"
     }
   }
   ```

2. CREATE Prisma schema:
   File: apps/api/prisma/schema.prisma

   ```prisma
   generator client {
     provider = "prisma-client-js"
   }

   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }

   // ============================================================================
   // USER & AUTH
   // ============================================================================

   model User {
     id           String   @id @default(uuid()) @db.Uuid
     email        String   @unique
     passwordHash String   @map("password_hash")
     phone        String?  @unique
     displayName  String   @map("display_name")
     language     Language @default(HY)
     createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
     updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     vehicles       Vehicle[]
     paymentMethods PaymentMethod[]
     payments       Payment[]
     sessions       Session[]
     reviews        Review[]

     @@map("users")
   }

   enum Language {
     HY // Armenian
     RU // Russian
     EN // English
   }

   // ============================================================================
   // VEHICLE
   // ============================================================================

   model Vehicle {
     id              String        @id @default(uuid()) @db.Uuid
     userId          String        @map("user_id") @db.Uuid
     make            String
     model           String
     year            Int
     connectorType   ConnectorType @map("connector_type")
     batteryCapacity Float         @map("battery_capacity") // kWh
     maxChargePower  Float         @map("max_charge_power") // kW
     createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz
     updatedAt       DateTime      @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
     sessions Session[]

     @@map("vehicles")
   }

   enum ConnectorType {
     TYPE_1
     TYPE_2
     CCS
     CHADEMO
     TESLA
     GBT
   }

   // ============================================================================
   // PAYMENT
   // ============================================================================

   model PaymentMethod {
     id          String         @id @default(uuid()) @db.Uuid
     userId      String         @map("user_id") @db.Uuid
     gateway     PaymentGateway
     token       String // Tokenized payment method (never raw card data)
     last4       String?        @db.Char(4)
     expiryMonth Int?           @map("expiry_month")
     expiryYear  Int?           @map("expiry_year")
     isDefault   Boolean        @default(false) @map("is_default")
     createdAt   DateTime       @default(now()) @map("created_at") @db.Timestamptz
     updatedAt   DateTime       @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
     payments Payment[]

     @@map("payment_methods")
   }

   enum PaymentGateway {
     ARCA
     IDRAM
     APPLE_PAY
     GOOGLE_PAY
     WALLET
   }

   model Payment {
     id                   String        @id @default(uuid()) @db.Uuid
     sessionId            String        @unique @map("session_id") @db.Uuid
     userId               String        @map("user_id") @db.Uuid
     paymentMethodId      String        @map("payment_method_id") @db.Uuid
     gateway              PaymentGateway
     status               PaymentStatus
     amount               Int // AMD (Armenian Dram, stored as integer cents)
     authorizedAmount     Int           @map("authorized_amount")
     capturedAmount       Int           @map("captured_amount")
     gatewayTransactionId String?       @map("gateway_transaction_id")
     createdAt            DateTime      @default(now()) @map("created_at") @db.Timestamptz
     updatedAt            DateTime      @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     user          User          @relation(fields: [userId], references: [id])
     paymentMethod PaymentMethod @relation(fields: [paymentMethodId], references: [id])
     session       Session       @relation(fields: [sessionId], references: [id])

     @@map("payments")
   }

   enum PaymentStatus {
     PENDING
     AUTHORIZED
     CAPTURED
     FAILED
     REFUNDED
   }

   // ============================================================================
   // PLACEHOLDERS FOR FUTURE STEPS
   // ============================================================================

   // These models will be defined in Steps 5-6, but we need to declare them
   // here so relations don't break

   model Session {
     id String @id @default(uuid()) @db.Uuid
     // Full schema in Step 6

     userId    String @map("user_id") @db.Uuid
     vehicleId String? @map("vehicle_id") @db.Uuid

     user    User     @relation(fields: [userId], references: [id])
     vehicle Vehicle? @relation(fields: [vehicleId], references: [id])
     payment Payment?

     @@map("sessions")
   }

   model Review {
     id String @id @default(uuid()) @db.Uuid
     // Full schema in Step 8

     userId String @map("user_id") @db.Uuid

     user User @relation(fields: [userId], references: [id])

     @@map("reviews")
   }
   ```

3. CREATE .env file for backend:
   File: apps/api/.env

   ```env
   # Database
   DATABASE_URL=postgresql://lilocharge:lilocharge_dev_password@localhost:5432/lilocharge

   # Redis
   REDIS_URL=redis://:lilocharge_redis_password@localhost:6379

   # JWT
   JWT_SECRET=lilocharge_jwt_secret_dev_only_change_in_production
   JWT_EXPIRY=1h
   REFRESH_TOKEN_SECRET=lilocharge_refresh_secret_dev_only_change_in_production
   REFRESH_TOKEN_EXPIRY=7d

   # Environment
   NODE_ENV=development
   PORT=3000
   ```

4. CREATE TypeScript config for API:
   File: apps/api/tsconfig.json

   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "module": "commonjs",
       "outDir": "./dist",
       "baseUrl": "./",
       "paths": {
         "@/*": ["src/*"]
       },
       "incremental": true,
       "skipLibCheck": true,
       "strictNullChecks": true,
       "noImplicitAny": true,
       "strictBindCallApply": false,
       "forceConsistentCasingInFileNames": false,
       "noFallthroughCasesInSwitch": false,
       "esModuleInterop": true,
       "emitDecoratorMetadata": true,
       "experimentalDecorators": true
     },
     "include": ["src/**/*", "prisma/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

5. CREATE NestJS config:
   File: apps/api/nest-cli.json

   ```json
   {
     "$schema": "https://json.schemastore.org/nest-cli",
     "collection": "@nestjs/schematics",
     "sourceRoot": "src",
     "compilerOptions": {
       "deleteOutDir": true,
       "webpack": true,
       "tsConfigPath": "tsconfig.json"
     }
   }
   ```

6. RUN Prisma migration:

   ```bash
   cd apps/api
   pnpm install
   pnpm prisma generate
   pnpm prisma migrate dev --name init_core_entities
   ```

7. CREATE Prisma client singleton:
   File: apps/api/src/prisma.service.ts

   ```typescript
   import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
   import { PrismaClient } from '@prisma/client';

   @Injectable()
   export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
     constructor() {
       super({
         log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
       });
     }

     async onModuleInit() {
       await this.$connect();
     }

     async onModuleDestroy() {
       await this.$disconnect();
     }

     /**
      * Clean all tables (for testing only)
      */
     async cleanDatabase() {
       if (process.env.NODE_ENV === 'production') {
         throw new Error('Cannot clean database in production');
       }

       // Delete in order to respect foreign key constraints
       await this.$transaction([
         this.payment.deleteMany(),
         this.paymentMethod.deleteMany(),
         this.session.deleteMany(),
         this.review.deleteMany(),
         this.vehicle.deleteMany(),
         this.user.deleteMany(),
       ]);
     }
   }
   ```

8. CREATE seed script:
   File: apps/api/prisma/seed.ts

   ```typescript
   import { PrismaClient } from '@prisma/client';
   import * as bcrypt from 'bcrypt';

   const prisma = new PrismaClient();

   async function main() {
     console.log('Seeding database...');

     // Create test user
     const passwordHash = await bcrypt.hash('TestUser123!', 12);

     const user = await prisma.user.upsert({
       where: { email: 'test@lilocharge.am' },
       update: {},
       create: {
         email: 'test@lilocharge.am',
         passwordHash,
         phone: '+37477123456',
         displayName: 'Անի Սարգսյան',
         language: 'HY',
       },
     });

     console.log('Created user:', user.email);

     // Create test vehicle
     const vehicle = await prisma.vehicle.upsert({
       where: { id: '00000000-0000-0000-0000-000000000001' },
       update: {},
       create: {
         id: '00000000-0000-0000-0000-000000000001',
         userId: user.id,
         make: 'BYD',
         model: 'Dolphin',
         year: 2024,
         connectorType: 'CCS',
         batteryCapacity: 60.48,
         maxChargePower: 88,
       },
     });

     console.log('Created vehicle:', `${vehicle.make} ${vehicle.model}`);

     console.log('Seed complete!');
   }

   main()
     .catch((e) => {
       console.error(e);
       process.exit(1);
     })
     .finally(async () => {
       await prisma.$disconnect();
     });
   ```

9. RUN seed script:

   ```bash
   cd apps/api
   pnpm prisma:seed
   ```

10. CREATE test for Prisma service:
    File: apps/api/src/prisma.service.spec.ts

    ```typescript
    import { Test, TestingModule } from '@nestjs/testing';
    import { PrismaService } from './prisma.service';

    describe('PrismaService', () => {
      let service: PrismaService;

      beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [PrismaService],
        }).compile();

        service = module.get<PrismaService>(PrismaService);
      });

      afterEach(async () => {
        await service.$disconnect();
      });

      it('should be defined', () => {
        expect(service).toBeDefined();
      });

      it('should connect to database', async () => {
        await expect(service.$connect()).resolves.not.toThrow();
      });

      it('should query users table', async () => {
        const users = await service.user.findMany({ take: 1 });
        expect(Array.isArray(users)).toBe(true);
      });
    });
    ```

CONSTRAINTS:

- All tables must use snake_case names (users, not Users)
- All columns must use snake_case (created_at, not createdAt)
- All IDs must be UUIDs (@db.Uuid)
- All timestamps must use @db.Timestamptz (timezone-aware)
- Cascade deletes only for owned entities (Vehicle when User deleted, but NOT Session)
- Password must be hashed with bcrypt (rounds >= 12)
- Never store plain text passwords in database
- Seed script must be idempotent (use upsert, not create)
- Currency amounts stored as integer cents (AMD \* 100) to avoid float precision issues
- Default language must be Armenian (HY)

VALIDATION:

```bash
cd apps/api
pnpm install
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma:seed
pnpm typecheck
pnpm test prisma.service.spec.ts
psql postgresql://lilocharge:lilocharge_dev_password@localhost:5432/lilocharge -c "\dt"  # Should show users, vehicles, payment_methods, payments tables
```

DONE WHEN:

- Prisma client generates without errors
- Migration creates 4 tables: users, vehicles, payment_methods, payments
- Seed script creates test user and vehicle
- PrismaService connects to database successfully
- All TypeScript types match @lilocharge/shared-types interfaces
- No warnings about snake_case/camelCase mismatches

```

---

### Step 5: Prisma Schema — Geospatial Entities (Station, Connector, PricingPlan)

**Goal:** Extend Prisma schema with Station, Connector, and PricingPlan entities, add PostGIS geography column for station locations, and create GiST index for spatial queries.

**Why:** Stations are the core of the discovery feature. The Station model includes PostGIS geography for efficient nearby search using ST_DWithin. Prisma doesn't natively support PostGIS, so we'll use Unsupported() type and add the geography column + index via raw SQL migration.

```

Read AGENTS.md fully. You are the Database Agent adding geospatial entities to the Prisma schema.

CONTEXT:
This step extends the Prisma schema from Step 4 with Station, Connector, and PricingPlan.
Stations have geographic locations stored as PostGIS geography(Point, 4326) for WGS84 coordinates.
A GiST spatial index enables fast ST_DWithin queries for "find stations within 5km of user's location".

Prisma doesn't support PostGIS geography natively, so we'll:

1. Define location as Unsupported("geography(Point, 4326)") in schema.prisma
2. Add the geography column + GiST index via raw SQL in migration
3. Query via Prisma.$queryRaw for geospatial operations, Prisma ORM for everything else

Each Station has multiple Connectors (one per EVSE/charging point). Each Connector can have
different pricing (some operators charge per kWh, some per minute, some both). PricingPlan
captures these tariffs.

REFERENCE FILES (read these first):

- /apps/api/prisma/schema.prisma — Existing schema from Step 4
- /packages/shared-types/src/station.ts — Station and Connector interfaces
- /AGENTS.md — PostGIS usage patterns
- /docs/prd.md — Station data model (lines 230-250)

BUILD:

1. UPDATE Prisma schema with Station entities:
   File: apps/api/prisma/schema.prisma (add after Payment model)

   ```prisma
   // ============================================================================
   // STATION & CONNECTOR
   // ============================================================================

   model Station {
     id           String        @id @default(uuid()) @db.Uuid
     operatorId   String        @map("operator_id") // External operator ID (not FK)
     operatorName String        @map("operator_name")
     name         String
     address      String
     city         String
     latitude     Float
     longitude    Float
     // PostGIS geography column (added via raw SQL migration)
     location     Unsupported("geography(Point, 4326)")?
     status       StationStatus @default(AVAILABLE)
     openingHours String?       @map("opening_hours")
     amenities    String[]      @default([])
     createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz
     updatedAt    DateTime      @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     connectors Connector[]
     reviews    Review[]

     @@map("stations")
   }

   enum StationStatus {
     AVAILABLE
     OCCUPIED
     OFFLINE
     MAINTENANCE
   }

   model Connector {
     id               String        @id @default(uuid()) @db.Uuid
     stationId        String        @map("station_id") @db.Uuid
     evseId           String        @map("evse_id") // OCPP identifier
     connectorType    ConnectorType @map("connector_type")
     powerKw          Float         @map("power_kw")
     status           StationStatus @default(AVAILABLE)
     lastStatusUpdate DateTime      @default(now()) @map("last_status_update") @db.Timestamptz
     createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz
     updatedAt        DateTime      @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     station      Station        @relation(fields: [stationId], references: [id], onDelete: Cascade)
     pricingPlans PricingPlan[]
     sessions     Session[]

     @@unique([stationId, evseId])
     @@map("connectors")
   }

   model PricingPlan {
     id             String   @id @default(uuid()) @db.Uuid
     connectorId    String   @map("connector_id") @db.Uuid
     name           String
     pricePerKwh    Int?     @map("price_per_kwh") // AMD cents
     pricePerMinute Int?     @map("price_per_minute") // AMD cents
     sessionFee     Int?     @map("session_fee") // AMD cents
     idleFee        Int?     @map("idle_fee") // AMD cents per minute
     validFrom      DateTime @map("valid_from") @db.Timestamptz
     validUntil     DateTime? @map("valid_until") @db.Timestamptz
     createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
     updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     connector Connector @relation(fields: [connectorId], references: [id], onDelete: Cascade)

     @@map("pricing_plans")
   }
   ```

2. UPDATE Review model (add stationId relation):
   File: apps/api/prisma/schema.prisma (update Review placeholder)

   ```prisma
   model Review {
     id        String   @id @default(uuid()) @db.Uuid
     stationId String   @map("station_id") @db.Uuid
     userId    String   @map("user_id") @db.Uuid
     rating    Int      @db.SmallInt // 1-5
     comment   String?  @db.Text
     photos    String[] @default([])
     createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
     updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

     // Relations
     station Station @relation(fields: [stationId], references: [id], onDelete: Cascade)
     user    User    @relation(fields: [userId], references: [id])

     @@map("reviews")
   }
   ```

3. CREATE migration with PostGIS geography column:

   ```bash
   cd apps/api
   pnpm prisma migrate dev --name add_geospatial_entities --create-only
   ```

4. EDIT the generated migration to add PostGIS geography:
   File: apps/api/prisma/migrations/XXXXXX_add_geospatial_entities/migration.sql (modify)
   Add AFTER the CREATE TABLE stations block:

   ```sql
   -- Add PostGIS geography column and populate from lat/long
   ALTER TABLE stations ADD COLUMN location geography(Point, 4326);

   UPDATE stations
   SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography;

   -- Create GiST spatial index for fast nearby searches
   CREATE INDEX idx_stations_location ON stations USING GIST(location);

   -- Create trigger to auto-update location from lat/long
   CREATE OR REPLACE FUNCTION update_station_location()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER trg_update_station_location
   BEFORE INSERT OR UPDATE OF latitude, longitude ON stations
   FOR EACH ROW
   EXECUTE FUNCTION update_station_location();
   ```

5. RUN migration:

   ```bash
   cd apps/api
   pnpm prisma migrate dev
   ```

6. CREATE seed data for stations:
   File: apps/api/prisma/seed.ts (add after vehicle creation)

   ```typescript
   // Create test stations in Yerevan
   const stations = [
     {
       id: '10000000-0000-0000-0000-000000000001',
       operatorId: 'ev-armenia-001',
       operatorName: 'EV Armenia',
       name: 'Cascade Complex Charging Station',
       address: 'Tamanyan St, Yerevan',
       city: 'Yerevan',
       latitude: 40.1872,
       longitude: 44.5152,
       status: 'AVAILABLE',
       openingHours: '24/7',
       amenities: ['WiFi', 'Cafe', 'Restroom'],
     },
     {
       id: '10000000-0000-0000-0000-000000000002',
       operatorId: 'icharge-001',
       operatorName: 'iCharge',
       name: 'Republic Square Charging',
       address: 'Republic Square, Yerevan',
       city: 'Yerevan',
       latitude: 40.1776,
       longitude: 44.5126,
       status: 'AVAILABLE',
       openingHours: '06:00-22:00',
       amenities: ['Parking'],
     },
   ];

   for (const stationData of stations) {
     const station = await prisma.station.upsert({
       where: { id: stationData.id },
       update: {},
       create: stationData,
     });

     console.log('Created station:', station.name);

     // Create connectors for each station
     await prisma.connector.create({
       data: {
         stationId: station.id,
         evseId: `${stationData.operatorId}-evse-1`,
         connectorType: 'CCS',
         powerKw: 50,
         status: 'AVAILABLE',
       },
     });

     await prisma.connector.create({
       data: {
         stationId: station.id,
         evseId: `${stationData.operatorId}-evse-2`,
         connectorType: 'TYPE_2',
         powerKw: 22,
         status: 'AVAILABLE',
       },
     });
   }

   console.log('Created connectors');
   ```

7. RUN updated seed:

   ```bash
   cd apps/api
   pnpm prisma:seed
   ```

8. CREATE test for PostGIS queries:
   File: apps/api/src/stations/stations.repository.spec.ts

   ```typescript
   import { Test, TestingModule } from '@nestjs/testing';
   import { PrismaService } from '../prisma.service';

   describe('Stations Repository - PostGIS Queries', () => {
     let prisma: PrismaService;

     beforeAll(async () => {
       const module: TestingModule = await Test.createTestingModule({
         providers: [PrismaService],
       }).compile();

       prisma = module.get<PrismaService>(PrismaService);
     });

     afterAll(async () => {
       await prisma.$disconnect();
     });

     it('should find stations within radius using ST_DWithin', async () => {
       // Yerevan center coordinates
       const latitude = 40.1872;
       const longitude = 44.5152;
       const radiusMeters = 5000; // 5km

       const result = await prisma.$queryRaw<any[]>`
         SELECT
           id,
           name,
           latitude,
           longitude,
           ST_Distance(
             location,
             ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
           ) as distance
         FROM stations
         WHERE ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
           ${radiusMeters}
         )
         ORDER BY distance ASC
       `;

       expect(result.length).toBeGreaterThan(0);
       expect(result[0]).toHaveProperty('distance');
       expect(Number(result[0].distance)).toBeLessThanOrEqual(radiusMeters);
     });

     it('should calculate distance accurately', async () => {
       const station = await prisma.station.findFirst();
       expect(station).toBeDefined();

       const result = await prisma.$queryRaw<any[]>`
         SELECT
           ST_Distance(
             ST_SetSRID(ST_MakePoint(${station!.longitude}, ${station!.latitude}), 4326)::geography,
             ST_SetSRID(ST_MakePoint(${station!.longitude}, ${station!.latitude}), 4326)::geography
           ) as distance
       `;

       expect(Number(result[0].distance)).toBe(0);
     });
   });
   ```

9. CREATE helper function for geospatial queries:
   File: apps/api/src/stations/stations.queries.ts

   ```typescript
   import { Prisma } from '@prisma/client';

   export interface NearbyStationParams {
     latitude: number;
     longitude: number;
     radiusMeters: number;
     limit?: number;
   }

   export function buildNearbyStationsQuery(params: NearbyStationParams): Prisma.Sql {
     const { latitude, longitude, radiusMeters, limit = 50 } = params;

     return Prisma.sql`
       SELECT
         s.*,
         ST_Distance(
           s.location,
           ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
         ) as distance
       FROM stations s
       WHERE ST_DWithin(
         s.location,
         ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
         ${radiusMeters}
       )
       ORDER BY distance ASC
       LIMIT ${limit}
     `;
   }
   ```

CONSTRAINTS:

- PostGIS geography column must use SRID 4326 (WGS84)
- GiST index is required for ST_DWithin performance
- Trigger auto-updates location whenever latitude or longitude changes
- Never store location without latitude/longitude (both are required)
- Connector evseId must be unique per station (used by OCPP)
- PricingPlan dates must use timezone-aware timestamps
- Pricing stored as integer cents (AMD) to avoid float issues
- Station status defaults to AVAILABLE
- Amenities stored as array of strings (no separate junction table)

VALIDATION:

```bash
cd apps/api
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma:seed
pnpm test stations.repository.spec.ts
psql postgresql://lilocharge:lilocharge_dev_password@localhost:5432/lilocharge -c "SELECT name, ST_AsText(location) FROM stations;"
```

DONE WHEN:

- Migration creates stations, connectors, pricing_plans tables
- PostGIS geography column exists with GiST index
- Trigger auto-populates location from lat/long
- Seed creates 2 stations with 4 connectors total
- PostGIS query test passes (finds stations within 5km)
- Distance calculation is accurate (0 meters for same point)

```

### Step 6: Prisma Schema — Time-Series Entities (Session, MeterValue with TimescaleDB)

**Goal:** Extend Prisma schema with Session and MeterValue entities, create TimescaleDB hypertable for meter values.

**Why:** Sessions track charging events. MeterValue stores high-frequency meter readings requiring TimescaleDB for efficient time-series storage.

```

Read AGENTS.md fully. You are the Database Agent adding session and time-series entities.

[BUILD section contains: Update Prisma schema with Session/MeterValue, create migration, add TimescaleDB hypertable, create continuous aggregates, add retention policy, update seed data]

[Full implementation following the pattern from Steps 4-5 - truncated for brevity]

```

---

### Step 7: NestJS Backend Scaffolding

**Goal:** Initialize NestJS with Fastify, global pipes, CORS, Swagger docs.

**Why:** Foundation for REST API that all feature modules build upon.

```

[Full NestJS setup with main.ts, app.module.ts, health check, exception filters - following Step 5 pattern]

```

---

### Step 8: Auth Module — JWT + Phone OTP

**Goal:** Implement phone OTP registration, email/password login, JWT tokens, refresh flow.

**Why:** Required before users can access any protected endpoints.

```

[Auth service, controllers, DTOs, Redis OTP storage, JWT generation - following established patterns]

```

---

### Step 9: Users Module

**Goal:** User profile CRUD operations and preferences management.

**Why:** Users need to manage their profile, language settings, notification preferences.

```

[Users service, controller, update profile endpoints, language switching]

```

---

### Step 10: Vehicles Module

**Goal:** Vehicle CRUD with connector type auto-detection.

**Why:** Vehicle profile enables connector compatibility filtering and personalized recommendations.

```

[Vehicles service, CRUD endpoints, connector type validation against enum]

```

---

### Step 11: Mobile App Scaffolding (Expo Router)

**Goal:** Initialize React Native Expo app with file-based routing, navigation, folder structure.

**Why:** Mobile app foundation using modern Expo Router pattern.

```

[Expo init, install dependencies, setup app/ directory routing, configure Expo plugins]

```

---

### Step 12: i18n Setup (Armenian/Russian/English)

**Goal:** Configure react-i18next with Armenian as default, translation file structure.

**Why:** Tri-lingual support is core requirement, Armenian-first design.

```

[Install i18next, create translation JSON files, configure provider, create useTranslation hook]

```

---

### Step 13: API Client with Interceptors

**Goal:** Create typed API client with auth interceptors, error handling, request/response transformation.

**Why:** Centralized API layer with automatic token injection and error handling.

```

[Axios/Fetch client, auth interceptor, error interceptor, type-safe request methods]

```

---

### Step 14: Mobile Onboarding Flow

**Goal:** Build registration → phone verification → vehicle setup → payment method screens.

**Why:** First-run experience that creates user account and configures profile.

```

[Onboarding screens, phone input, OTP verification, vehicle selection, skip payment]

```

---

### Step 15: CI/CD Pipelines

**Goal:** GitHub Actions for backend tests/deploy, EAS Build for mobile.

**Why:** Automated testing and deployment pipeline.

```

[.github/workflows/backend.yml for NestJS, mobile.yml with EAS Build integration]

```

---

### Step 16: Stations Module with PostGIS Geospatial Queries

**Goal:** Implement nearby station search using ST_DWithin, station detail endpoints.

**Why:** Core discovery feature - find stations within radius of user location.

```

[Stations service with PostGIS queries, nearby search endpoint, station detail with connectors]

```

---

### Step 17: Data Import Scripts (Open Charge Map + Manual Operators)

**Goal:** Scripts to import station data from Open Charge Map API and CSV files from Armenian operators.

**Why:** Populate database with real Armenian station data.

```

[Import scripts, CSV parsers, Open Charge Map API client, upsert logic]

```

---

### Step 18: Connectors Module (Status Management, Pricing)

**Goal:** Connector status updates, pricing calculation based on tariff plan.

**Why:** Real-time connector availability and transparent pricing.

```

[Connector service, status update endpoint, pricing calculator using PricingPlan]

```

---

### Step 19: Station Detail Endpoint with Aggregated Data

**Goal:** GET /stations/:id with connectors, pricing, reviews, distance.

**Why:** Complete station information for detail view.

```

[Aggregated query joining station, connectors, pricing_plans, reviews with avg rating]

```

---

### Step 20: Mapbox Integration (Mobile)

**Goal:** Integrate Mapbox GL Native, custom station markers, clustering.

**Why:** Interactive map with real-time station visualization.

```

[Mapbox SDK setup, custom marker components, marker clustering, offline tiles]

```

---

### Step 21: Mobile Map View (Station Discovery UI)

**Goal:** Map screen with nearby stations, marker tap → bottom sheet.

**Why:** Primary discovery interface.

```

[Map component, marker rendering, bottom sheet for station detail, camera controls]

```

---

### Step 22: Station Bottom Sheet UI

**Goal:** Sliding bottom sheet with station details, connectors, pricing, reviews.

**Why:** Quick view of station information without leaving map.

```

[Bottom sheet component, connector cards, pricing display, navigate to detail button]

```

---

### Step 23: Station Filtering System

**Goal:** Filter by connector type, power level, availability, operator.

**Why:** Help users find compatible stations quickly.

```

[Filter component, multi-select for connector types, power slider, operator chips]

```

---

### Step 24: Tri-Lingual Search

**Goal:** Search stations by name/address in Armenian/Russian/English with fuzzy matching.

**Why:** Support natural language search across all three languages.

```

[Search endpoint with pg_trgm, search input component, debounced search]

```

---

### Step 25: Favorites Module

**Goal:** Save/unsave stations, list favorites with local persistence (MMKV).

**Why:** Quick access to frequently used stations.

```

[Favorites endpoints, MMKV storage, favorites list screen, toggle favorite button]

```

---

### Step 26: OCPP Module Scaffolding

**Goal:** WebSocket server for OCPP 1.6-J using ocpp-rpc library.

**Why:** Foundation for charge point communication.

```

[OCPP WebSocket server, message routing, charge point registration]

```

---

### Step 27: OCPP BootNotification + Heartbeat

**Goal:** Handle BootNotification (charge point registration) and Heartbeat messages.

**Why:** Establish connection with charge points.

```

[BootNotification handler, Heartbeat handler, charge point status tracking]

```

---

### Step 28: OCPP StatusNotification Handler

**Goal:** Process connector status updates from charge points.

**Why:** Real-time connector availability updates.

```

[StatusNotification handler, update connector status in DB, broadcast to WebSocket clients]

```

---

### Step 29: OCPP MeterValues Handler + TimescaleDB Ingestion

**Goal:** Ingest meter readings into TimescaleDB hypertable.

**Why:** Store high-frequency power/energy data for billing and analytics.

```

[MeterValues handler, parse OCPP meter values, batch insert to meter_values table]

```

---

### Step 30: RemoteStartTransaction Implementation

**Goal:** Send RemoteStartTransaction command to charge point with retry logic.

**Why:** Initiate charging remotely from mobile app.

```

[RemoteStartTransaction method, retry logic, timeout handling, transaction ID tracking]

```

---

### Step 31: RemoteStopTransaction Implementation

**Goal:** Send RemoteStopTransaction to end charging session.

**Why:** Stop charging from mobile app.

```

[RemoteStopTransaction method, session completion logic, final cost calculation]

```

---

### Step 32: Sessions Module — Lifecycle Management

**Goal:** Manage session states: pending → authorized → active → completed.

**Why:** Track charging session from start to finish.

```

[Session service with state machine, create session, start session, stop session]

```

---

### Step 33: Sessions Module — Cost Calculation Engine

**Goal:** Calculate total cost from energy, time, idle fees, session fee.

**Why:** Transparent billing based on operator pricing plans.

```

[Cost calculator using PricingPlan, energy cost, time cost, idle time detection]

```

---

### Step 34: ArCa Payment Gateway Integration

**Goal:** Integrate ArCa (Armenian card gateway) for pre-auth, capture, refund.

**Why:** Primary payment method in Armenia.

```

[ArCa API client, pre-authorization, capture after session, refund for failed sessions]

```

---

### Step 35: Idram Payment Integration

**Goal:** Integrate Idram wallet API.

**Why:** Popular mobile wallet in Armenia.

```

[Idram API client, wallet payment flow, balance check]

```

---

### Step 36: Apple Pay Integration

**Goal:** Native Apple Pay SDK integration with payment token handling.

**Why:** Convenient payment for iOS users.

```

[Apple Pay native module, payment sheet, token exchange]

```

---

### Step 37: Google Pay Integration

**Goal:** Native Google Pay SDK integration.

**Why:** Convenient payment for Android users.

```

[Google Pay native module, payment sheet, token exchange]

```

---

### Step 38: Real-Time Session Monitoring (WebSocket)

**Goal:** Socket.IO server for live session updates, mobile WebSocket client.

**Why:** Real-time power, energy, cost updates during charging.

```

[Socket.IO server, session room, emit meter value updates, mobile WebSocket client]

```

---

### Step 39: Push Notifications (FCM)

**Goal:** Firebase Cloud Messaging setup with notification templates.

**Why:** Notify users of session start, completion, payment success/failure.

```

[FCM admin SDK, notification service, templates for session events, mobile FCM handlers]

```

---

### Step 40: Session History + PDF Receipt Generation

**Goal:** List past sessions, generate PDF receipts.

**Why:** Transaction history and proof of charging.

```

[Session history endpoint with pagination, PDF generation using pdfkit, download endpoint]

```

---

### Step 41: Reviews Module

**Goal:** Star ratings, comments, photo uploads for stations.

**Why:** Community-driven trust signals.

```

[Reviews service, create/update/delete review, photo upload to S3/Cloudinary]

```

---

### Step 42: Problem Reporting System

**Goal:** Flag broken/offline stations, notify operators.

**Why:** Crowdsourced station status accuracy.

```

[Problem reports model, create report endpoint, operator notification emails]

```

---

### Step 43: Community Status Updates

**Goal:** User-reported status with confidence scoring.

**Why:** Real-time status more accurate than stale OCPP data.

```

[Status update model, confidence algorithm based on recency and user reputation]

```

---

### Step 44: In-App Wallet

**Goal:** User balance, top-up flows, wallet payment option.

**Why:** Instant session start without pre-auth.

```

[Wallet model, top-up via ArCa/Idram, deduct balance on session completion]

```

---

### Step 45: Wallet Payment Flow

**Goal:** Use wallet balance for charging sessions.

**Why:** Faster than card pre-auth.

```

[Check wallet balance before session start, instant debit, handle insufficient funds]

```

---

### Step 46: Performance Optimization — Mobile

**Goal:** Lazy loading, image compression, map clustering.

**Why:** Fast app performance on 3G networks.

```

[React.lazy for screens, image optimization, Mapbox clustering, cached responses]

```

---

### Step 47: Performance Optimization — Backend

**Goal:** Query optimization, Redis caching, connection pooling.

**Why:** API response time <200ms at P95.

```

[Prisma query optimization, Redis for station/connector cache, DB connection pool tuning]

```

---

### Step 48: Observability Setup

**Goal:** Sentry error tracking, Pino logging, OpenTelemetry, Grafana dashboards.

**Why:** Production monitoring and debugging.

```

[Sentry SDK, structured logging, tracing, Grafana dashboards for key metrics]

```

---

### Step 49: App Store Submission Materials

**Goal:** Screenshots, descriptions, privacy policy in Armenian/Russian/English.

**Why:** Required for App Store and Google Play submission.

```

[Screenshot automation, store listings, privacy policy document]

```

---

### Step 50: Production Deployment

**Goal:** Kubernetes manifests, load balancer config, secrets management.

**Why:** Production-ready infrastructure.

```

[K8s deployments, Ingress, SSL certs, secret management, auto-scaling]

```

---

## Section 2: Test Steps

---

### Step 51: Test — User Registration Flow

**Goal:** Test phone OTP registration end-to-end.

```

[E2E test: send OTP → verify code → check user created → tokens valid]

```

---

### Step 52: Test — Station Discovery

**Goal:** Test map loading, nearby search, filtering.

```

[Load map → verify stations appear → filter by CCS → verify filtered results]

```

---

### Step 53: Test — QR Scan to Session Start

**Goal:** Test QR code scan → session start with real OCPP simulator.

```

[Scan QR → verify connector → start session → OCPP RemoteStart sent → session active]

```

---

### Step 54: Test — Real-Time Session Monitoring

**Goal:** Test live session updates and cost calculation.

```

[Active session → verify WebSocket updates → check cost calculation accuracy]

```

---

### Step 55: Test — Session Stop and Receipt

**Goal:** Test session stop, final cost, PDF receipt.

```

[Stop session → verify final cost → download PDF receipt → verify content]

```

---

### Step 56: Test — Payment Flows

**Goal:** Test all 4 payment gateways (ArCa, Idram, Apple Pay, Google Pay).

```

[Test each gateway: pre-auth → session → capture → verify payment record]

```

---

### Step 57: Test — Wallet Top-Up and Payment

**Goal:** Test wallet top-up and wallet payment for session.

```

[Top-up wallet → start session with wallet → verify instant debit]

```

---

### Step 58: Test — Session History

**Goal:** Test session list and filtering.

```

[Load history → filter by date → verify results → check pagination]

```

---

### Step 59: Test — OCPP Fault Handling

**Goal:** Test charger offline mid-session, reconnection.

```

[Simulate charger disconnect → verify session marked failed → reconnect → verify recovery]

```

---

### Step 60: Test — Payment Failures

**Goal:** Test declined card, expired token, network timeout.

```

[Trigger payment failures → verify error handling → check refund logic]

```

---

### Step 61: Test — Zero-Energy Sessions

**Goal:** Test charger fault with zero energy delivered, auto-refund.

```

[Start session → charger fault → zero kWh → verify auto-refund]

```

---

### Step 62: Test — Concurrent Session Attempts

**Goal:** Test multiple users trying to use same connector.

```

[User A starts → User B attempts same connector → verify rejection]

```

---

### Step 63: Test — Network Resilience

**Goal:** Test offline mode, cached data, background sync.

```

[Disable network → verify cached stations load → re-enable → verify sync]

```

---

### Step 64: Test — Armenian Character Rendering

**Goal:** Test Armenian text across all UI screens.

```

[Check all screens → verify Armenian characters render correctly → no boxes/fallbacks]

```

---

### Step 65: Test — Multi-Language Switching

**Goal:** Test switching between Armenian, Russian, English.

```

[Switch to Russian → verify UI updates → switch to English → verify again]

```

---

### Step 66: Test — Multi-Operator Session Simulation

**Goal:** Test sessions across 3+ different operators in sequence.

```

[Session with EV Armenia → Session with iCharge → Session with EVAN → verify all complete]

```

---

### Step 67: Test — Load Testing

**Goal:** Test 1000 concurrent sessions, 10K WebSocket connections.

```

[Artillery/k6 load test → verify no failures → check response times]

```

---

### Step 68: Test — OCPP Compatibility

**Goal:** Test OCPP 1.6-J and 2.0.1 with real hardware.

```

[Connect real chargers → test all OCPP messages → verify compatibility]

```

---

### Step 69: Test — Payment Gateway Sandbox

**Goal:** Test all gateways in sandbox mode.

```

[ArCa sandbox → Idram test env → Apple Pay sandbox → Google Pay test]

```

---

### Step 70: Test — Production Readiness Checklist

**Goal:** Security audit, performance benchmarks, final QA.

```

[Security scan → load test → manual QA → sign-off]

````

---

## Appendix: Running This PromptBook

```bash
# Prerequisites
node >= 18.0.0
pnpm >= 8.0.0
Docker >= 24.0.0
Expo CLI
Android Studio (for Android) or Xcode (for iOS)

# Start infrastructure
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Verify infrastructure
./scripts/verify-infrastructure.sh

# Run all steps (build first, then tests)
./scripts/run-promptbook-lilocharge.sh

# Run only build prompts (Steps 1-50)
./scripts/run-promptbook-lilocharge.sh --build-only

# Run only test prompts (Steps 51-70)
./scripts/run-promptbook-lilocharge.sh --tests-only

# Run a single step
./scripts/run-promptbook-lilocharge.sh --step 15

# Run steps 10-20
./scripts/run-promptbook-lilocharge.sh --steps 10-20

# Check current status
./scripts/run-promptbook-lilocharge.sh --status

# Reset and start fresh
./scripts/run-promptbook-lilocharge.sh --reset

# Retry failed steps
./scripts/run-promptbook-lilocharge.sh --retry
````

## Appendix: Dependency Graph

```
Step 1 (Monorepo Init)
 └── Step 2 (Shared Types)
      ├── Step 3 (Docker Infrastructure)
      │    └── Step 4 (Prisma Core Schema)
      │         ├── Step 5 (Prisma Geospatial)
      │         └── Step 6 (Prisma Time-Series)
      │              └── Step 7 (Backend Scaffolding)
      │                   ├── Step 8 (Auth Module)
      │                   │    └── Step 9 (Users Module)
      │                   │         └── Step 10 (Vehicles Module)
      │                   ├── Step 16 (Stations Module)
      │                   │    └── Step 17 (Data Import)
      │                   │         └── Step 18 (Connectors Module)
      │                   ├── Step 26 (OCPP Scaffolding)
      │                   │    └── Step 27-31 (OCPP Handlers)
      │                   └── Step 32 (Sessions Module)
      │                        └── Step 33-40 (Payments, WebSocket, Notifications)
      └── Step 11 (Mobile Scaffolding)
           └── Step 12 (i18n Setup)
                └── Step 13 (API Client)
                     └── Step 14 (Onboarding Flow)
                          └── Step 20-25 (Map, Discovery UI)
                               └── Step 41-45 (Community, Wallet)
                                    └── Step 46-50 (Optimization, Deployment)
                                         └── Step 51-70 (All Tests)

Step 15 (CI/CD) can run in parallel after Step 1
Steps 46-48 (Optimization, Observability) require all feature modules complete
Steps 51-70 (Tests) require all build steps complete
```

## Appendix: Files Created Summary

### Infrastructure & Configuration

- `turbo.json` — Turborepo pipeline
- `pnpm-workspace.yaml` — Workspaces
- `.cursorrules`, `AGENTS.md` — AI agent instructions
- `infrastructure/docker/docker-compose.yml` — PostgreSQL, Redis, pgAdmin
- `.github/workflows/*.yml` — CI/CD pipelines
- `scripts/run-promptbook-lilocharge.sh` — Executor

### Packages: Shared Types

- `packages/shared-types/src/user.ts`
- `packages/shared-types/src/vehicle.ts`
- `packages/shared-types/src/station.ts`
- `packages/shared-types/src/session.ts`
- `packages/shared-types/src/payment.ts`
- `packages/shared-types/src/review.ts`
- `packages/shared-types/src/ocpp.ts`

### Backend: API (~120 files)

- `apps/api/prisma/schema.prisma` — Complete data model
- `apps/api/src/main.ts` — NestJS entry
- `apps/api/src/app.module.ts` — Root module
- `apps/api/src/prisma.service.ts` — Prisma singleton
- `apps/api/src/redis/redis.service.ts` — Redis client
- `apps/api/src/auth/*.ts` — Auth module (10+ files)
- `apps/api/src/users/*.ts` — Users module
- `apps/api/src/vehicles/*.ts` — Vehicles module
- `apps/api/src/stations/*.ts` — Stations module
- `apps/api/src/connectors/*.ts` — Connectors module
- `apps/api/src/sessions/*.ts` — Sessions module
- `apps/api/src/payments/*.ts` — Payments module (ArCa, Idram, Apple Pay, Google Pay)
- `apps/api/src/ocpp/*.ts` — OCPP central system
- `apps/api/src/websocket/*.ts` — Real-time session updates
- `apps/api/src/notifications/*.ts` — FCM push
- `apps/api/src/reviews/*.ts` — Reviews module
- `apps/api/src/wallet/*.ts` — Wallet module

### Mobile: App (~100 files)

- `apps/mobile/app/_layout.tsx` — Root layout
- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/app/(auth)/register.tsx`
- `apps/mobile/app/(auth)/verify-phone.tsx`
- `apps/mobile/app/(tabs)/map/index.tsx` — Main map
- `apps/mobile/app/(tabs)/session/index.tsx` — Active session
- `apps/mobile/app/(tabs)/favorites/index.tsx`
- `apps/mobile/app/(tabs)/profile/index.tsx`
- `apps/mobile/app/station/[id].tsx` — Station detail
- `apps/mobile/components/map/station-marker.tsx`
- `apps/mobile/components/map/station-bottom-sheet.tsx`
- `apps/mobile/components/session/live-monitor.tsx`
- `apps/mobile/stores/auth-store.ts` — Zustand auth
- `apps/mobile/stores/session-store.ts` — Session state
- `apps/mobile/services/api-client.ts`
- `apps/mobile/services/websocket-client.ts`
- `apps/mobile/services/mapbox-service.ts`
- `apps/mobile/i18n/hy.json` — Armenian translations
- `apps/mobile/i18n/ru.json` — Russian translations
- `apps/mobile/i18n/en.json` — English translations

---

_End of PromptBook-LiloCharge.md — Execute steps in order. Each step builds on previous outputs._
