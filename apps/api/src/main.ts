import 'reflect-metadata';

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
