import type { FastifyReply } from 'fastify';

import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

import { HealthController } from './health.controller';

interface MockedReply {
  readonly status: jest.Mock;
  readonly send: jest.Mock;
}

function createController(overrides?: {
  prisma?: Partial<Pick<PrismaService, '$queryRaw'>>;
  redis?: Partial<Pick<RedisService, 'get'>>;
}): HealthController {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    ...overrides?.prisma,
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    ...overrides?.redis,
  };

  return new HealthController(prisma as unknown as PrismaService, redis as unknown as RedisService);
}

function createReply(): MockedReply {
  const reply: MockedReply = {
    status: jest.fn(),
    send: jest.fn().mockResolvedValue(undefined),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

describe('HealthController', () => {
  describe('getHealth (liveness)', () => {
    it('returns a successful health response', () => {
      const controller = createController();
      const result = controller.getHealth();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('lilocharge-api');
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });

    it('uses configured APP_NAME when provided', () => {
      const previousAppName = process.env.APP_NAME;
      process.env.APP_NAME = 'lilocharge-api-test';

      const controller = createController();
      const result = controller.getHealth();

      expect(result.service).toBe('lilocharge-api-test');

      process.env.APP_NAME = previousAppName;
    });
  });

  describe('getReadiness', () => {
    it('returns 200 with all checks up when database and redis respond', async () => {
      const controller = createController();
      const reply = createReply();

      await controller.getReadiness(reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({
        status: 'ok',
        checks: { database: 'up', redis: 'up' },
      });
    });

    it('returns 503 with database down when the database check fails', async () => {
      const controller = createController({
        prisma: { $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')) },
      });
      const reply = createReply();

      await controller.getReadiness(reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        status: 'error',
        checks: { database: 'down', redis: 'up' },
      });
    });

    it('returns 503 with redis down when the redis check fails', async () => {
      const controller = createController({
        redis: { get: jest.fn().mockRejectedValue(new Error('socket closed')) },
      });
      const reply = createReply();

      await controller.getReadiness(reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        status: 'error',
        checks: { database: 'up', redis: 'down' },
      });
    });

    it('marks both checks down when both dependencies fail', async () => {
      const controller = createController({
        prisma: { $queryRaw: jest.fn().mockRejectedValue(new Error('db down')) },
        redis: { get: jest.fn().mockRejectedValue(new Error('redis down')) },
      });
      const reply = createReply();

      await controller.getReadiness(reply as unknown as FastifyReply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(reply.send).toHaveBeenCalledWith({
        status: 'error',
        checks: { database: 'down', redis: 'down' },
      });
    });
  });
});
