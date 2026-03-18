# PromptBook: LiloCharge P0 Security Fix

## Overview

This PromptBook fixes three P0 security issues identified in `docs/production-readiness-report.md`:

- **P0-1:** All 14 API controllers have zero authentication guards
- **P0-2:** `invalidateStation()` only deletes `station:detail:{id}`, leaving stale nearby/search cache for up to 5 min after connector status changes
- **P0-3:** No rate limiting on OTP endpoint — trivially abusable for SMS flooding

### Existing infrastructure reused

- `@nestjs/jwt` + `JwtService` already in `AuthService`
- `JWT_SECRET` / `REFRESH_TOKEN_SECRET` already in `apps/api/.env`
- Access token payload: `{ sub: string, email: string, tokenType: 'access' }` (`auth.service.ts:28-38`)
- `RedisService` extended with `scanKeys` + `delMany`
- Station GET endpoints remain **public** (anonymous map browsing)

---

## Step 1 — JWT Auth Guard + Global Route Protection

Read these files first:

- `apps/api/src/auth/auth.service.ts` — token payload shape (lines 28–38)
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/app.module.ts`
- All 14 controller files under `apps/api/src/`

### Task

**Create new files:**

1. `apps/api/src/auth/guards/jwt-auth.guard.ts`
   - Implements `CanActivate`
   - Extracts `Authorization: Bearer <token>` header; throws `401` if missing/malformed
   - Calls `jwtService.verifyAsync(token, { secret: process.env.JWT_SECRET })`
   - Throws `401` if `payload.tokenType !== 'access'` (blocks refresh tokens used as access)
   - Attaches `payload` to `request['user']`
   - Skips if `Reflector.getAllAndOverride(IS_PUBLIC_KEY, [...])` returns true

2. `apps/api/src/auth/decorators/public.decorator.ts`
   - `export const Public = () => SetMetadata('IS_PUBLIC', true)`

3. `apps/api/src/auth/decorators/current-user.decorator.ts`
   - `createParamDecorator` returning `request['user']`

4. `apps/api/src/auth/guards/idor.guard.ts`
   - Compares `request.params.userId` with `request.user.sub`; throws `403` if mismatch
   - Returns `true` (no-op) when route has no `:userId` param

**Modify existing files:**

5. `apps/api/src/auth/auth.module.ts`
   - `JwtModule.register({ secret: process.env.JWT_SECRET })`
   - Add `JwtAuthGuard`, `IdorGuard` to providers and exports

6. `apps/api/src/app.module.ts`
   - Import `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])`
   - Add `{ provide: APP_GUARD, useClass: JwtAuthGuard }`
   - Add `{ provide: APP_GUARD, useClass: ThrottlerGuard }`

7. `apps/api/src/auth/auth.controller.ts`
   - Add `@Public()` at class level
   - Add per-endpoint `@Throttle(...)` decorators (see Step 3)

8. `apps/api/src/stations/stations.controller.ts`
   - Add `@Public()` at class level (3 GET endpoints remain unauthenticated)

9. `apps/api/src/health/health.controller.ts`
   - Add `@Public()` at class level

10. Add `@UseGuards(IdorGuard)` at class level to all 10 user-scoped controllers:
    `users`, `sessions`, `payments`, `wallet`, `reviews`, `favorites`, `vehicles`,
    `notifications`, `problem-reports`, `connector-status-updates`

**Validation:**

```bash
cd apps/api && pnpm typecheck && pnpm test && pnpm lint
```

**Done when:**

- `GET /users/123/wallet` with no token → 401
- `GET /users/A/wallet` with user-B token → 403
- `GET /stations/nearby` with no token → 200
- `GET /health` with no token → 200

---

## Step 2 — Redis Nearby Cache Invalidation Fix

Read these files first:

- `apps/api/src/redis/redis.service.ts`
- `apps/api/src/redis/cache.service.ts` (focus on `invalidateStation`, lines 97–101)

### Task

**Modify `apps/api/src/redis/redis.service.ts`:**

Add two new public methods:

```typescript
public async scanKeys(pattern: string): Promise<string[]> {
  return this.client.keys(pattern);
}

public async delMany(keys: string[]): Promise<void> {
  if (keys.length > 0) {
    await this.client.del(keys);
  }
}
```

**Modify `apps/api/src/redis/cache.service.ts`:**

Update `invalidateStation(stationId)` to also bust nearby and search caches:

```typescript
public async invalidateStation(stationId: string): Promise<void> {
  await this.redisService.del(`station:detail:${stationId}`);

  const [nearbyKeys, searchKeys] = await Promise.all([
    this.redisService.scanKeys('station:nearby:*'),
    this.redisService.scanKeys('station:search:*'),
  ]);

  await Promise.all([
    this.redisService.delMany(nearbyKeys),
    this.redisService.delMany(searchKeys),
  ]);

  this.logger.debug(
    `Invalidated station cache: ${stationId} (nearby: ${nearbyKeys.length}, search: ${searchKeys.length})`,
  );
}
```

**Validation:**

```bash
cd apps/api && pnpm typecheck && pnpm test && pnpm lint
```

**Done when:**

- `invalidateStation('abc')` deletes `station:detail:abc`, all `station:nearby:*` keys, all `station:search:*` keys
- All existing `CacheService` tests still pass

---

## Step 3 — Rate Limiting

Read these files first:

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.controller.ts`

### Task

**Install dependency** (if not already installed):

```bash
cd apps/api && pnpm add @nestjs/throttler
```

**Modify `apps/api/src/app.module.ts`:**

- Add `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` to imports (100 req/min global default per IP)
- Add `{ provide: APP_GUARD, useClass: ThrottlerGuard }` to providers

**Modify `apps/api/src/auth/auth.controller.ts`:**

Add per-endpoint throttle overrides:

```typescript
@Post('otp/request')
@Throttle({ default: { ttl: 300000, limit: 5 } })   // 5 per 5 min
requestPhoneOtp(...)

@Post('otp/verify')
@Throttle({ default: { ttl: 300000, limit: 10 } })   // 10 per 5 min
verifyPhoneOtpAndRegister(...)

@Post('login')
@Throttle({ default: { ttl: 60000, limit: 10 } })    // 10 per min
login(...)

@Post('refresh')
@Throttle({ default: { ttl: 60000, limit: 20 } })    // 20 per min
refreshTokens(...)
```

**Validation:**

```bash
cd apps/api && pnpm typecheck && pnpm test && pnpm lint
```

**Done when:**

- `POST /auth/otp/request` 6th call in 5 min window → 429
- `POST /auth/login` 11th call in 1 min → 429
- Other endpoints are unaffected by auth-specific limits

---

## Step 4 — P0 Test Suite

Read these files first:

- `apps/api/src/auth/guards/jwt-auth.guard.ts`
- `apps/api/src/auth/guards/idor.guard.ts`
- `apps/api/src/redis/cache.service.ts`
- `apps/api/src/redis/redis.service.ts`
- Existing test patterns: `apps/api/src/auth/auth.controller.spec.ts`, `apps/api/src/redis/cache.service.spec.ts`

### Task

**Create `apps/api/src/auth/guards/jwt-auth.guard.spec.ts`:**

Test cases:

- Valid access token → guard passes, `request.user` is populated
- No authorization header → 401
- Malformed header (not `Bearer ...`) → 401
- Expired token (verifyAsync throws) → 401
- Wrong secret (verifyAsync throws) → 401
- Refresh token used as access token (`tokenType: 'refresh'`) → 401
- Route marked `@Public()` with no token → passes

**Create `apps/api/src/auth/guards/idor.guard.spec.ts`:**

Test cases:

- `params.userId === user.sub` → passes
- `params.userId !== user.sub` → 403
- No `:userId` param in route → passes (no-op)
- No user attached to request → 403

**Extend `apps/api/src/redis/cache.service.spec.ts`:**

Add to the `invalidateStation` describe block:

- Calls `scanKeys('station:nearby:*')` and `delMany(nearbyKeys)`
- Calls `scanKeys('station:search:*')` and `delMany(searchKeys)`
- `invalidateConnector()` cascades to `invalidateStation()` which also scans nearby/search

Update `mockRedisService` to include `scanKeys` and `delMany` mocks.

**Validation:**

```bash
cd apps/api && pnpm typecheck && pnpm test && pnpm lint
```

**Done when:**

- All new guard tests pass
- All updated `CacheService` tests pass
- No existing tests regress
- Zero TypeScript errors
- Zero lint errors

---

## Final Verification

Run the complete validation suite:

```bash
cd apps/api && pnpm typecheck && pnpm test && pnpm lint
```

Expected behavior:

- `GET /users/123/wallet` with no token → **401**
- `GET /users/A/wallet` with user-B token → **403**
- `GET /stations/nearby` with no token → **200**
- `GET /health` with no token → **200**
- `POST /auth/otp/request` 6th call in 5 min → **429**
- `invalidateStation('abc')` also scans and deletes `station:nearby:*` + `station:search:*` keys
