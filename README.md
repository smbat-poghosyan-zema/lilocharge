# LiloCharge - EV Charging Super-App for Armenia

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)

**Unified EV charging platform aggregating all Armenian charging networks into a single,
transparent, frictionless mobile experience.**

## Features

- **Universal Discovery**: Find public charging stations across Armenia (Open Charge Map +
  operator CSV import), with real Mapbox maps, clustering, and rich filter/pin UI
- **Real-Time Status**: Live availability over WebSocket with community-driven confidence scores
- **Two-Tap Charging**: QR scan -> confirm -> live monitoring -> summary, wired end-to-end to
  OCPP remote start/stop
- **Payments**: ArCa and Idram integration (webhooks with signature verification + idempotency),
  payment-method management, and an in-app wallet (top-up, ledger, session debit). Apple Pay /
  Google Pay require a configured token-exchange service and native modules — currently out of
  scope; the backend fails loudly rather than faking it
- **Tri-Lingual**: Armenian, Russian, English with an in-app language switcher (Armenian-first)
- **Community Features**: Ratings and reviews with photo upload (S3 presigned URLs), problem
  reports, crowdsourced status updates
- **OCPP Integration**: OCPP 1.6-J full core profile, plus OCPP 2.0.1 core charging profile
  (no reservations, smart charging, firmware/display management, device model, or security
  events — see [docs/prd.md](docs/prd.md) for the support matrix)
- **Push, Offline, Geolocation**: FCM wiring (needs credentials), offline cache/banner/retry,
  GPS-anchored nearby search

## Tech Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Mobile   | React Native + Expo SDK 51                            |
| Backend  | NestJS + Fastify                                      |
| Database | PostgreSQL 16 + PostGIS + TimescaleDB                 |
| Cache    | Redis 7                                               |
| ORM      | Prisma 5                                              |
| Maps     | Mapbox GL Native                                      |
| OCPP     | ocpp-rpc (1.6-J core + 2.0.1 core charging profile)   |
| Payments | ArCa, Idram, wallet (native Pay modules out of scope) |
| Push     | Firebase Cloud Messaging                              |
| i18n     | react-i18next                                         |

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

## Project Structure

```text
lilocharge/
|- apps/
|  |- api/              # NestJS backend
|  `- mobile/           # React Native Expo app
|- packages/
|  `- shared-types/     # TypeScript interfaces shared by api and mobile
|- infrastructure/
|  |- docker/           # Docker Compose configs (dev + e2e test stack)
|  `- k8s/              # Kubernetes manifests
|- scripts/             # Security scan / production validation scripts
`- docs/                # PRD, deployment guide, reports, privacy policy
```

## Testing

```bash
# API unit tests (hermetic, no services needed)
pnpm --filter @lilocharge/api test

# API e2e tests: start the test stack, apply migrations, then run
docker compose -f infrastructure/docker/docker-compose.test.yml up -d --wait
DATABASE_URL='postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test' \
  pnpm --filter @lilocharge/api exec prisma migrate deploy
pnpm --filter @lilocharge/api test:e2e

# Mobile tests (build shared-types first on a fresh checkout)
pnpm --filter @lilocharge/shared-types build
pnpm --filter @lilocharge/mobile test

# Everything via turbo
pnpm test
```

- Mobile functional e2e (Detox) needs an emulator/simulator and prebuilt native
  projects — see [apps/mobile/e2e/README.md](apps/mobile/e2e/README.md).
- Load tests were executed 2026-07-07 — methodology and numbers in
  [docs/load-test-results.md](docs/load-test-results.md).
- CI enforces typecheck, non-mutating lint, and coverage floors
  (`.github/workflows/backend.yml`, `.github/workflows/mobile.yml`).

## Documentation

- [Product Requirements Document](docs/prd.md)
- [Deployment Guide](docs/DEPLOYMENT.md) (+ [K8s quick reference](docs/K8S-QUICKREF.md))
- [Production Readiness Report](docs/production-readiness-report.md)
- [Audit Report](AUDIT-REPORT.md) and [Backlog](BACKLOG.md)
- [Load Test Results](docs/load-test-results.md)
- [OCPP Hardware Testing Guide](docs/ocpp-hardware-testing.md)
- [API Observability Guide](apps/api/OBSERVABILITY.md)

## License

Proprietary. All rights reserved.
