# Mobile E2E (Detox)

Functional flow tests live in `e2e/flows/` (onboarding, discovery, charging, profile).
The legacy `e2e/screenshots/` suite generates store screenshots only.

Every `testID` referenced by a flow is guarded by
`src/testing/e2e-testid-guard.spec.ts`, which runs in the normal `pnpm test`
jest project and fails if a flow references an id that no longer exists in
`src/` or `app/` — this prevents the suite from rotting against the app again.

## Requirements

Detox cannot run in a plain container: it needs macOS + Xcode for iOS or an
Android SDK with an emulator, plus native projects generated from this managed
Expo app. Native directories are intentionally **not** committed — generate
them on the CI machine with prebuild.

## Runbook (Android)

```bash
cd apps/mobile

# 1. Generate the native project (once per checkout / config change)
npx expo prebuild --platform android --no-install

# 2. Build the Detox binary
npx detox build --configuration android.emu.release

# 3. Create/boot the emulator named in .detoxrc.json (Pixel_8_Pro_API_34), then:
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx detox test --configuration android.emu.release e2e/flows
```

## Runbook (iOS, macOS only)

```bash
cd apps/mobile
npx expo prebuild --platform ios --no-install && (cd ios && pod install)
npx detox build --configuration ios.sim.release
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 npx detox test --configuration ios.sim.release e2e/flows
```

## Backend

Flows degrade gracefully when no backend is reachable (they assert the error
states), but for full coverage run the API + test stack first:

```bash
docker compose -f infrastructure/docker/docker-compose.test.yml up -d
pnpm --filter @lilocharge/api dev
```

`EXPO_PUBLIC_API_URL` is inlined at bundle time — set it before `detox build`,
not just before `detox test`.
