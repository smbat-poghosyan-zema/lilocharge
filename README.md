# LiloCharge - EV Charging Super-App for Armenia

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)

**Unified EV charging platform aggregating all Armenian charging networks into a single,
transparent, frictionless mobile experience.**

## Features

- **Universal Discovery**: Find all public charging stations across Armenia (9+ operators)
- **Real-Time Status**: Live availability with community-driven confidence scores
- **Unified Payments**: ArCa, Idram, Apple Pay, Google Pay in one app
- **Two-Tap Charging**: QR scan -> confirm -> start (fastest in market)
- **Tri-Lingual**: Armenian, Russian, English (Armenian-first design)
- **Community Features**: Ratings, photos, problem reports
- **OCPP Integration**: Works with any OCPP 1.6-J or 2.0.1 compliant charger

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

## Project Structure

```text
lilocharge/
|- apps/
|  |- api/              # NestJS backend
|  `- mobile/           # React Native Expo app
|- packages/
|  |- shared-types/     # TypeScript interfaces
|  `- shared-utils/     # Common utilities
|- infrastructure/
|  |- docker/           # Docker Compose configs
|  `- k8s/              # Kubernetes manifests
|- scripts/             # Deployment and utility scripts
`- docs/                # Documentation (PRD, ADRs, API specs)
```

## Documentation

- [Product Requirements Document](docs/prd.md)
- [API Documentation](docs/api/README.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Deployment Guide](docs/deployment.md)
- [Testing Guide](docs/testing.md)

## License

Proprietary. All rights reserved.
