import 'reflect-metadata';

import helmet, { type FastifyHelmetOptions } from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HttpLoggingInterceptor, LoggerService, initializeOpenTelemetry } from './observability';

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const DEFAULT_CORS_ORIGINS: readonly string[] = ['http://localhost:3000', 'http://localhost:19006'];

/** Parses a comma-delimited CORS origin list from environment configuration. */
export function parseCorsOrigins(rawOrigins: string | undefined): true | string[] {
  if (rawOrigins === undefined) {
    return [...DEFAULT_CORS_ORIGINS];
  }

  const trimmedOrigins = rawOrigins.trim();
  if (trimmedOrigins.length === 0) {
    return [...DEFAULT_CORS_ORIGINS];
  }

  if (trimmedOrigins === '*') {
    return true;
  }

  const origins = trimmedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : true;
}

/**
 * Builds the security header (helmet) configuration.
 *
 * The default helmet CSP blocks inline scripts/styles and data: images, which breaks the
 * Swagger UI served at /docs (it bootstraps itself with inline <script>/<style> tags and
 * data:-URI assets). We therefore relax only scriptSrc/styleSrc/imgSrc/fontSrc while keeping
 * a restrictive defaultSrc, objectSrc, and frameAncestors. crossOriginEmbedderPolicy is
 * disabled for the same reason (Swagger UI loads assets without CORP headers).
 */
export function buildHelmetOptions(): FastifyHelmetOptions {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  };
}

/** Resolves the HTTP server port from environment input with validation. */
export function resolvePort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > MAX_PORT) {
    return DEFAULT_PORT;
  }

  return port;
}

/** Creates the NestJS application, applies global configuration, and starts serving traffic. */
export async function bootstrap(): Promise<void> {
  // Initialize OpenTelemetry before anything else
  initializeOpenTelemetry();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  // Get Pino logger from the app context
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // The cast is required because pnpm resolves two fastify copies (this app pins ^4.29.x
  // while @nestjs/platform-fastify pins 4.28.1 exactly), which makes the plugin's
  // FastifyInstance generics nominally incompatible at compile time despite being
  // runtime-compatible fastify 4.x instances.
  await app.register<FastifyHelmetOptions>(helmet as never, buildHelmetOptions());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new HttpLoggingInterceptor(logger));
  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LiloCharge API')
    .setDescription('REST API documentation for the LiloCharge EV charging platform.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = resolvePort(process.env.PORT);
  await app.listen(port, '0.0.0.0');

  const appUrl = await app.getUrl();
  const metricsPort = process.env.OTEL_METRICS_PORT ?? '9464';
  logger.log(`LiloCharge API listening on ${appUrl}`);
  logger.log(`Swagger docs available at ${appUrl}/docs`);
  logger.log(`Metrics available at http://localhost:${metricsPort}/metrics`);
}

if (require.main === module) {
  void bootstrap();
}
