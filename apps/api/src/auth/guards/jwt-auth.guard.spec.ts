import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard';

const buildContext = (
  headers: Record<string, string>,
  handlerMeta?: boolean,
  classMeta?: boolean,
) => ({
  switchToHttp: () => ({
    getRequest: () => ({ headers }),
  }),
  getHandler: () => ({}),
  getClass: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _meta: { handler: handlerMeta, class: classMeta },
});

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<Reflector>;

    guard = new JwtAuthGuard(jwtService, reflector);
  });

  describe('public routes', () => {
    it('should pass when IS_PUBLIC metadata is set', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const ctx = buildContext({}) as never;

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });
  });

  describe('authenticated routes', () => {
    it('should pass and attach user when valid access token is provided', async () => {
      const payload = { sub: 'user-id', email: 'test@example.com', tokenType: 'access' };
      jwtService.verifyAsync.mockResolvedValue(payload);

      const request = { headers: { authorization: 'Bearer valid-token' } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never;

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect((request as Record<string, unknown>)['user']).toEqual(payload);
    });

    it('should throw 401 when no authorization header is provided', async () => {
      const ctx = buildContext({}) as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw 401 when authorization header is malformed (no Bearer prefix)', async () => {
      const ctx = buildContext({ authorization: 'Token some-token' }) as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw 401 when token is expired', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      const ctx = buildContext({ authorization: 'Bearer expired-token' }) as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw 401 when token has wrong secret', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      const ctx = buildContext({ authorization: 'Bearer bad-secret-token' }) as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw 401 when token is malformed', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));
      const ctx = buildContext({ authorization: 'Bearer not.a.jwt' }) as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw 401 when refresh token is used as access token', async () => {
      const refreshPayload = { sub: 'user-id', jti: 'some-jti', tokenType: 'refresh' };
      jwtService.verifyAsync.mockResolvedValue(refreshPayload);

      const ctx = buildContext({ authorization: 'Bearer refresh-token' }) as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});
