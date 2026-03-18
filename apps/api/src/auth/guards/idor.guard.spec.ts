import { ForbiddenException } from '@nestjs/common';

import { IdorGuard } from './idor.guard';

const buildContext = (params: Record<string, string>, user?: { sub: string }) => ({
  switchToHttp: () => ({
    getRequest: () => ({ params, user }),
  }),
});

describe('IdorGuard', () => {
  let guard: IdorGuard;

  beforeEach(() => {
    guard = new IdorGuard();
  });

  it('should pass when params.userId matches user.sub', () => {
    const ctx = buildContext({ userId: 'user-123' }, { sub: 'user-123' }) as never;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw 403 when params.userId does not match user.sub', () => {
    const ctx = buildContext({ userId: 'user-A' }, { sub: 'user-B' }) as never;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should pass (no-op) when route has no :userId param', () => {
    const ctx = buildContext({ stationId: 'station-1' }, { sub: 'user-123' }) as never;

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw 403 when user is not attached to request', () => {
    const ctx = buildContext({ userId: 'user-123' }, undefined) as never;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
