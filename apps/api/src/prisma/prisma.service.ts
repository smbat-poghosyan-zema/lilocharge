import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const DEFAULT_CONNECTION_LIMIT = 10;
const DEFAULT_POOL_TIMEOUT_SECONDS = 30;

/** Prisma client wrapper managed by NestJS dependency injection. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionLimit = process.env.DATABASE_CONNECTION_LIMIT
      ? Number(process.env.DATABASE_CONNECTION_LIMIT)
      : DEFAULT_CONNECTION_LIMIT;
    const poolTimeout = process.env.DATABASE_POOL_TIMEOUT
      ? Number(process.env.DATABASE_POOL_TIMEOUT)
      : DEFAULT_POOL_TIMEOUT_SECONDS;

    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: buildDatabaseUrlWithPoolSettings(
            process.env.DATABASE_URL ?? '',
            connectionLimit,
            poolTimeout,
          ),
        },
      },
    });
  }

  /** Opens the Prisma database connection when the module initializes. */
  public async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Closes the Prisma database connection when the module is destroyed. */
  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Appends connection pool configuration to a PostgreSQL connection URL.
 *
 * @param baseUrl - Base DATABASE_URL connection string
 * @param connectionLimit - Maximum number of database connections in the pool
 * @param poolTimeoutSeconds - Maximum time to wait for a connection from the pool
 * @returns Enhanced connection URL with pool parameters
 */
function buildDatabaseUrlWithPoolSettings(
  baseUrl: string,
  connectionLimit: number,
  poolTimeoutSeconds: number,
): string {
  if (!baseUrl) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', String(connectionLimit));
  url.searchParams.set('pool_timeout', String(poolTimeoutSeconds));

  return url.toString();
}
