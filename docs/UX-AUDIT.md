# UX / UI Audit — LiloCharge Mobile

> **Scope:** `apps/mobile` (Expo SDK 51.0.39, React Native 0.74.5, Expo Router 3.5).
> Branch `claude/lilocharge-audit-58jj4m`. **Read-only audit** — no source/test/config
> files were modified; this document is the only artifact.
> **Method:** static reading of every screen + `StyleSheet.create` block, quantitative
> grep sweeps of the color/style surface, and verification of the NativeWind v4 integration
> path against the published `nativewind@4.2.6` package (npm) since `nativewind.dev` is
> blocked by the environment proxy.
>
> **Conventions honoured (from CLAUDE.md / AGENTS.md):** money is integer AMD cents
> (`formatAmdFromCents`); Armenian-first tri-lingual (hy default + fallback, ru, en) with
> key-parity typechecked; Detox testIDs are guarded by `src/testing/e2e-testid-guard.spec.ts`;
> mobile coverage floors (86/73/88/86) are CI-enforced; `packages/shared-types` must be
> rebuilt before mobile tsc/tests.

---

## 1. Executive summary

The app is **functionally complete and visually incoherent by construction**. It was
assembled function-first by parallel agents against a backlog + tests; no design layer was
ever authored. The evidence:

| Signal | Measured | Where |
| --- | --- | --- |
| Design-token / theme file | **0** (none exists) | no `theme.ts`, no token module anywhere in `src/` |
| Distinct hardcoded hex colors | **37** | 24 per-screen `StyleSheet.create` blocks |
| Neutral/gray families used **interchangeably** | **2** (Tailwind `gray` ×10 shades + `slate` ×6 shades) | see §2.1 |
| Screens re-declaring a `primaryButton` | **12** | duplicated `#0F766E` block |
| Screens re-declaring a `secondaryButton` | **12** | duplicated teal-outline block |
| Screens re-declaring a `card` | **11** | `#FFFFFF` + `#E5E7EB` + radius 12/14 |
| Screens re-declaring a `centeredContainer` loading/error block | **8** | + `ActivityIndicator color="#0F766E"` hardcoded in **8** places |
| Screens re-declaring `errorText` | **16** | `#991B1B`/`#B91C1C` |
| Screens with text inputs re-declaring field/label styles | **10** | |
| Shared UI primitives in `src/components/` | **0** product primitives (only 3 utilities: error boundary, offline banner, lazy fallback) | |
| Screens with any `accessibilityLabel` | **7 / ~30** | §3 |
| `KeyboardAvoidingView` usages | **0** | §3, §6 |
| `SafeAreaView` / `useSafeAreaInsets` usages | **0** | §3, §6 |
| Dark mode | **absent**; `app.json` hard-locks `"userInterfaceStyle": "light"` | §5 |

**The team's chosen direction — adopt NativeWind v4 (Tailwind for RN) as the styling /
design-system layer — is the right lever.** It converts the 37-color, 24-StyleSheet sprawl
into one `tailwind.config.js` token source, makes dark mode and responsive/i18n resilience
near-free (`dark:` variants, token-driven), and lets us delete ~24 `StyleSheet.create`
blocks in favor of a handful of shared primitives. §8 is the verified integration path;
§9 is the sequenced migration backlog.

**Highest-leverage first step:** land the NativeWind v4 **foundation + token palette**
(UX-P0-01) and prove it on **one pilot screen** with the full 67-suite / ~500-test jest
run still green and `tsc`/`eslint --max-warnings 0` clean. Everything else is mechanical
once that is proven, because the risky pieces are all in the foundation: the custom Metro
resolver (Mapbox mock) and the `jest-expo` transform.

---

## 2. Design-system absence (the drift, with specifics)

There is no source of truth for color, spacing, typography, or radius. Every screen owns a
local `StyleSheet.create` block (24 total, listed below) and re-derives the same visual
decisions with slightly different numbers.

### 2.1 Color drift — 37 hex values, two clashing neutral scales

Frequency of the top hardcoded hexes (whole `app/` + `src/`):

```
72  #FFFFFF   surface / on-primary text
65  #111827   primary text (gray-900)
44  #0F766E   BRAND TEAL (primary action)   ← the one intentional color
38  #E5E7EB   borders / dividers (gray-200)
22  #F3F4F6   screen background (gray-100)
20  #166534 / 19 #6B7280 / 17 #F9FAFB / 17 #4B5563 / 15 #991B1B / 15 #374151 ...
```

**Two neutral families are used interchangeably** — the single biggest source of "looks
slightly off between screens":

- Tailwind **gray**: `#F9FAFB #F3F4F6 #E5E7EB #D1D5DB #9CA3AF #6B7280 #4B5563 #374151 #1F2937 #111827` (10 shades)
- Tailwind **slate**: `#E2E8F0 #CBD5E1 #94A3B8 #334155 #1E293B #0F172A` (6 shades)

Some screens frame cards in `gray`, others in `slate`; a user paging between them sees the
border/background temperature shift for no reason.

**Greens are equally fragmented** — success/positive is spelled at least six ways:
`#0F766E` (teal, also the brand), `#065F46`, `#166534`, `#16A34A`, `#059669`, `#14532D`
(the station-detail CTA is `#14532D`, a *different* dark green from the brand teal — a clear
accident), plus tints `#ECFDF5 #CCFBF1 #A7F3D0 #4ADE80`. Reds: `#991B1B #DC2626 #B91C1C`
+ tint `#FEE2E2`. Amber: `#F59E0B #D97706 #92400E`. One-off accent purple for community
status (`#6D28D9`, `#F5F3FF`) and a stray blue `#1D4ED8`.

### 2.2 Spacing / radius / typography magic numbers

No scale. Observed in-the-wild: padding `9/10/12/14/16/18/22/24`; border-radius
`10/12/14/18/999`; font sizes `11/12/13/14/15/16/17/18/20/24`; font weights
`'600'/'700'`. Card radius alone is `14` (session-summary, charge-confirm) vs `12`
(station bottom-sheet connector/review cards) vs `18` (bottom sheet shell) vs `10`
(bottom-sheet detail button). These are close enough to read as inconsistency, not
intent.

### 2.3 Target token set (→ `tailwind.config.js theme.extend`)

Collapse the 37 colors into a rationalized palette. Proposed tokens (semantic names, so
`dark:` variants and future rebrand are one-line changes):

| Token | Light value | Replaces |
| --- | --- | --- |
| `primary` (DEFAULT/`600`) | `#0F766E` | the brand teal (×44) |
| `primary-50/100` | `#ECFDF5` / `#CCFBF1` | teal tints, favorite/filter badges |
| `primary-900` | `#065F46` | dark teal text on tint |
| `neutral-0` | `#FFFFFF` | `#FFFFFF` surfaces |
| `neutral-50…900` | one scale (`#F9FAFB → #111827`) | **both** gray AND slate families |
| `success` / `success-bg` | `#16A34A` / `#DCFCE7` | the six greens + tints |
| `danger` / `danger-bg` | `#DC2626` / `#FEE2E2` | `#991B1B #B91C1C #DC2626` + `#FEE2E2` |
| `warning` / `warning-bg` | `#D97706` / `#FEF3C7` | `#F59E0B #D97706 #92400E` |
| `info` | `#1D4ED8` | stray blue |
| `accent` (community) | `#6D28D9` | purple community-status hint |
| `background` | `#F3F4F6` | screen bg (×22) |
| `border` | `#E5E7EB` | dividers (×38) |
| `text` / `text-muted` | `#111827` / `#6B7280` | body / muted |

Plus a **radius scale** (`sm:10 md:12 lg:14 xl:18 full:9999`) and lean on Tailwind's
default **spacing scale** (`px-4 py-4` = 16, etc.) to kill the magic numbers. Typography:
define a small set (`text-2xl` title 24, `text-lg` 17, `text-base` 15/16, `text-sm` 13/14,
`text-xs` 11/12) mapped to the existing sizes.

### 2.4 The 24 `StyleSheet.create` blocks (all migration targets)

```
src/components/lazy-load-error-boundary.tsx     src/features/onboarding/login-screen.tsx
src/components/lazy-load-fallback.tsx            src/features/onboarding/payment-method-screen.tsx
src/components/offline-banner.tsx                src/features/onboarding/registration-screen.tsx
src/features/favorites/favorites-screen.tsx      src/features/onboarding/vehicle-setup-screen.tsx
src/features/payments/payment-methods-screen.tsx src/features/onboarding/verify-phone-screen.tsx
src/features/problem-reports/problem-report-screen.tsx  src/features/profile/profile-screen.tsx
src/features/reviews/review-form-screen.tsx      src/features/sessions/active-session-screen.tsx
src/features/sessions/charge-confirm-screen.tsx  src/features/sessions/scan-screen.tsx
src/features/sessions/session-summary-screen.tsx src/features/stations/station-bottom-sheet.tsx
src/features/stations/station-detail-screen.tsx  src/features/stations/station-filters.tsx
src/features/stations/station-marker.tsx         src/features/stations/station-search-input.tsx
src/features/stations/stations-screen.tsx        src/features/wallet/wallet-screen.tsx
```

---

## 3. Missing shared primitives

`src/components/` contains only infrastructure (`lazy-load-error-boundary`,
`lazy-load-fallback`, `offline-banner`). **No Button, Card, Input, Badge, ScreenContainer,
or StateView exists.** The same patterns are hand-rolled per screen:

| Proposed primitive | Re-implemented in | Notes / variants observed |
| --- | --- | --- |
| **`Button`** (variants: `primary` teal, `secondary` teal-outline, `danger`, `link`) | `primaryButton` ×12, `secondaryButton` ×12 | Also handles the pressed-opacity (`{ pressed }` → `opacity 0.75`) and inline `ActivityIndicator` spinner (charge-confirm "starting" state). Danger variant seen implicitly in the stop-session destructive `Alert`. |
| **`Card`** | `card:` / `sectionCard` ×11 | `#FFFFFF` + `border #E5E7EB` + radius (14/12/18 — unify). |
| **`ScreenContainer`** (bg + safe-area + optional scroll/keyboard) | `container:` ×21 | Would also fix the **0 SafeAreaView** and **0 KeyboardAvoidingView** gaps in one place. |
| **`StatusBadge` / `Pill`** | session-summary, active-session, station-detail (3) + inline `filteredBadge`, favorite pill | Encapsulate the status→color map. `session-summary-screen.tsx` `resolveStatusBadgeStyles()` correctly maps FAILED/CANCELLED→red, COMPLETED→teal, else neutral — **this is the fixed FAILED-badge logic** and should become the single source in `StatusBadge`. |
| **`FormField` / `TextInput`** | 10 screens use `TextInput` and re-style label+input+error | inputs, `fieldLabel` (uppercase 12px), inline error text. |
| **`StateViews`** (`LoadingView` / `ErrorRetryView` / `EmptyState`) | `centeredContainer` ×8; `errorText` ×16; retry `Pressable` repeated | Every data screen (wallet, session-summary, charge-confirm, station-detail, active-session, profile, payment-methods) hand-rolls "spinner + muted text" / "error text + retry button" / "empty text". `ActivityIndicator color="#0F766E"` is hardcoded in **8** places → should read the `primary` token. Note there is **no reusable `EmptyState`** — empties are ad-hoc `<Text>` (`wallet-transactions-empty`, `amenitiesEmpty`, `noConnectors`, `noReviews`). |

**Building these six primitives first (after the token foundation) is what makes the
per-screen migration cheap and consistent** — each screen migration becomes "swap
StyleSheet → className + drop in primitives," not a redesign.

---

## 4. Accessibility

Assessed from code; on-device screen-reader behavior still needs a human pass (§7).

- **Labels:** `accessibilityLabel` appears in only **7** screens (login, registration,
  vehicle-setup, verify-phone, review-form, scan, station-search). `accessibilityRole` is
  better (21 screens) but roles without labels leave icon-only / short-text controls
  under-described. Fix as part of the `Button`/`FormField` primitives so a label is
  required by the component API.
- **Touch targets:** only **3** files set any `minHeight`/`minWidth`
  (`problem-report`, `review-form`, `station-marker`). Many `Pressable`s size purely from
  `paddingVertical` (e.g. bottom-sheet close/favorite pills at `paddingVertical: 7`, ≈30–34px
  tall) — **below the 44×44pt (iOS) / 48×48dp (Android) minimum.** Bake a `min-h-11`
  (44px) floor into `Button` and pill primitives.
- **Contrast risk:** muted grays on light backgrounds are borderline. `#9CA3AF`
  (gray-400) or `#6B7280` on `#F3F4F6` is around/below WCAG AA 4.5:1 for small text; the
  purple community hint `#6D28D9` at 11px is small-text-on-tint. The token palette is the
  place to fix this once (pick AA-passing `text-muted`).
- **Dynamic type / font scaling:** **0** references to `allowFontScaling`,
  `maxFontSizeMultiplier`, or `fontScale`. Fixed `fontSize` everywhere means large-font
  users get clipping. NativeWind respects `rem` scaling (`inlineRem: 14` default) — adopt
  `rem`-based text sizes and test at 200% type.
- **Safe area:** **0** `SafeAreaView`/`useSafeAreaInsets` (the dep
  `react-native-safe-area-context` is installed). Headers with fixed `paddingTop: 22`
  approximate a notch inset — fragile across devices. Centralize in `ScreenContainer`.

---

## 5. i18n layout resilience (Armenian-first)

The app is hy-default; hy strings are frequently **longer than en**, and layout overflow
is *not* tested (only glyph rendering is). Concrete at-risk spots (hy vs en measured from
`src/i18n/locales`):

| Element | hy | en | Risk |
| --- | --- | --- | --- |
| Charge tab label | `Լիցքավորում` (11) | `Charge` (6) | 4-tab bar; long labels clip/ellipsize on narrow devices |
| Confirm CTA | `Սկսել լիցքավորումը` (18) | `Start charging` | primary button; wraps to 2 lines on small screens |
| Summary receipt | `Դիտել անդորրագիրը (PDF)` | `View receipt (PDF)` | secondary button width |
| Bottom-sheet detail | `Բացել ամբողջ էջը` | `Open full details` | fixed-width pill/button |
| Status badges | localized `sessions.status.*` / station statuses | — | `borderRadius:999` pills with `overflow:hidden` will **clip**, not wrap, long status text |

Root cause: buttons/badges size to content with no wrap strategy and pills clip. Two
fixes, both cheap under NativeWind: (a) primitives default to `flex-wrap`/multi-line-safe
text and `min-h`, not fixed height; (b) **testing approach** — add a lightweight
`I18N_PSEUDO`/longest-locale snapshot or a Detox pass forced to `hy` that screenshots the
tab bar + the charge-confirm/summary CTAs + status badges. Cheapest first move: a jest
render test that mounts key screens under `hy` and asserts no text truncation props are
needed (or just visual-regression via §9 UX-P2-04).

---

## 6. Dark mode

Entirely absent, and actively locked off: `app.json` sets
`"userInterfaceStyle": "light"`, and there are **0** `useColorScheme`/`Appearance`
references. NativeWind makes this cheap **once tokens exist**: switch `app.json` to
`"automatic"`, set `darkMode: 'media'` (or `'class'`) in `tailwind.config.js`, define the
dark values on the semantic tokens, and add `dark:` variants only where the automatic
token flip isn't enough. Scope it **after** primitives + palette exist so it's a
token-file change, not 24 StyleSheet rewrites.

---

## 7. Per-screen heuristic pass

Walked from code. Cross-cutting issues (hardcoded colors, hand-rolled buttons/cards, no
safe-area, no keyboard avoidance) apply to nearly every screen and are not repeated per row.

- **Stations map + bottom sheet** (`stations-screen`, `station-bottom-sheet`,
  `station-marker`, `station-filters`, `station-search-input`): the only screen with inline
  `style={{…}}` objects (5, in `stations-screen`). Bottom sheet close/favorite pills are
  sub-44px touch targets; status text lives in clip-prone rounded pills; connector/review
  cards use `#F9FAFB` gray while other screens card in white/slate — the neutral clash is
  most visible here. Distance formatting (`m`/`km`) is hardcoded, not localized units.
- **Station detail** (`station-detail-screen`): CTA uses `#14532D` — a dark green that is
  **not** the brand teal `#0F766E` used everywhere else (visible inconsistency). Good:
  distinct loading / not-found / error+retry states and `accessibilityRole="header"`.
- **Scan** (`scan-screen`): has `accessibilityLabel`s (one of the better screens); camera
  permission + manual-entry fallback present.
- **Charge confirm** (`charge-confirm-screen`): solid state machine
  (idle/loading/loaded/error), inline spinner in the primary button, 409→
  "connector unavailable" mapping. CTA is the top hy-overflow risk (§5).
- **Active session** (`active-session-screen`): websocket + poll fallback + live clock;
  stop uses a destructive `Alert` (good). Status badge logic present.
- **Session summary** (`session-summary-screen`): the **reference implementation** for
  button variants (primary teal / secondary outline) and the corrected FAILED/CANCELLED
  badge coloring — mine these into `Button` + `StatusBadge`. (Debug footer previously
  removed — confirmed none present.)
- **Wallet** (`wallet-screen`): richest screen — balance, top-up presets + custom input,
  method picker, transactions list with an **ad-hoc** empty state; re-declares
  centeredContainer/error/retry and hardcodes `ActivityIndicator color="#0F766E"`.
- **Payment methods** (`payment-methods-screen`): most `accessibilityRole`s (9); Apple/
  Google Pay correctly fail loudly (no fake tokenization) per AGENTS.md.
- **Review / report forms** (`review-form-screen`, `problem-report-screen`): two of the
  three screens that bother with `minHeight`; hand-rolled `FormField` equivalents — prime
  `FormField` adopters.
- **Profile** (`profile-screen`): most loading/error branches (9 matches); logout is a
  destructive action — should use the `Button` `danger` variant once it exists.
- **Onboarding** (`login`, `register`, `verify-phone`, `vehicle`, `payment`): **none use
  `KeyboardAvoidingView`; only `vehicle-setup` uses a `ScrollView`.** On phones the keyboard
  will cover inputs on login/register/verify/payment — a real usability defect fixable in
  `ScreenContainer` (scroll + keyboard-avoid) during migration.
- **Nav / IA:** 4-tab structure (Stations / Charge / Favorites / Profile) is coherent;
  Charge tab label is the overflow risk. Headers are `headerShown:false` with per-screen
  hand-built headers (another consolidation target for `ScreenContainer`).

---

## 8. NativeWind v4 — verified integration path for THIS project

Verified against **`nativewind@4.2.6`** (current `latest`; peer `tailwindcss > 3.3.0`;
depends on `react-native-css-interop@0.2.6`). `nativewind/babel` re-exports
`react-native-css-interop/babel`. The `withNativeWind` signature was read directly from the
package (`dist/metro/index.d.ts`).

### 8.1 Dependencies

```bash
pnpm --filter @lilocharge/mobile add nativewind@^4.2.6
pnpm --filter @lilocharge/mobile add -D tailwindcss@^3.4  # peer: >3.3.0
# Remember repo rule: pnpm install --ignore-scripts
```

### 8.2 babel.config.js — add jsxImportSource + the nativewind preset

Current file is just `presets: ['babel-preset-expo']`. Change to:

```js
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

`jsxImportSource: 'nativewind'` is what lets core RN components accept `className`;
`nativewind/babel` (= `react-native-css-interop/babel`) wires the runtime. This runs in
**both** Metro and `babel-jest`, which is why tests keep working (§8.6).

### 8.3 metro.config.js — compose `withNativeWind` WITHOUT breaking the Mapbox resolver

This is the delicate part. `withNativeWind(config, { input })` **does not touch
`resolver.resolveRequest`** — it only adds a CSS transformer and Tailwind-watching config.
So the safe composition is: build the config, apply **all** the existing customizations
(watchFolders, nodeModulesPaths, and the Mapbox/mapbox-gl `resolveRequest`) to it, and only
then wrap the finished object. The custom resolver survives untouched:

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules/.pnpm/node_modules'),
];

// EXISTING custom resolver — swaps @rnmapbox/maps for a mock on web / Expo Go
// and stubs mapbox-gl on native. Keep EXACTLY as-is.
const forceMockMap = Boolean(process.env.EXPO_PUBLIC_FORCE_MOCK_MAP);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shouldMockMapbox = platform === 'web' || forceMockMap;
  if (shouldMockMapbox &&
      (moduleName === '@rnmapbox/maps' || moduleName.startsWith('@rnmapbox/maps/'))) {
    return { filePath: require.resolve('./src/__mocks__/rnmapbox-maps.js'), type: 'sourceFile' };
  }
  if (platform !== 'web' && (moduleName === 'mapbox-gl' || moduleName.startsWith('mapbox-gl/'))) {
    return { filePath: require.resolve('./src/__mocks__/empty-module.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Wrap LAST — withNativeWind returns the same config with the CSS transformer added,
// leaving resolver.resolveRequest intact.
module.exports = withNativeWind(config, { input: './global.css' });
```

**Verification for the migration:** after wiring, assert (a) web / `EXPO_PUBLIC_FORCE_MOCK_MAP=1`
bundles still resolve `@rnmapbox/maps` to the mock, and (b) a native bundle still stubs
`mapbox-gl`. This is the single riskiest change in the whole migration — treat a broken
Mapbox mock as a release blocker.

### 8.4 global.css + tailwind.config.js (where tokens live)

`global.css` (referenced by `withNativeWind({ input })`):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Import it once at the app entry — `app/_layout.tsx`:

```ts
import '../global.css';
```

`tailwind.config.js` — the **single design-token source** (§2.3 palette goes here):

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media', // enables §6 dark mode once tokens carry dark values
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0F766E', 50: '#ECFDF5', 100: '#CCFBF1', 900: '#065F46' },
        neutral: { 0: '#FFFFFF', 50: '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB',
                   400: '#9CA3AF', 500: '#6B7280', 700: '#374151', 900: '#111827' },
        success: { DEFAULT: '#16A34A', bg: '#DCFCE7' },
        danger:  { DEFAULT: '#DC2626', bg: '#FEE2E2' },
        warning: { DEFAULT: '#D97706', bg: '#FEF3C7' },
        info: '#1D4ED8',
        accent: '#6D28D9',
      },
      borderRadius: { sm: '10px', md: '12px', lg: '14px', xl: '18px' },
    },
  },
};
```

### 8.5 TypeScript — `nativewind-env.d.ts`

`withNativeWind` **auto-generates** `nativewind-env.d.ts` (default
`typescriptEnvPath: 'nativewind-env.d.ts'`) on Metro start; it contains
`/// <reference types="nativewind/types" />` and enables `className` typing. Requirements:
- Ensure it is picked up by tsc — `tsconfig.json` `include` uses `src/**` / `app/**`; add
  the generated file (or an `include` entry) so the `className` types load. The current
  `types: ["jest","react-native","expo-router"]` array does **not** need `nativewind`
  added — the triple-slash reference file handles it.
- Do **not** gitignore it and do **not** hand-edit it (NativeWind regenerates it and warns
  against manual edits). Commit it.

### 8.6 Jest — `jest-expo` preset stays; low risk to the ~500 tests

**NativeWind v4 ships no jest preset** (confirmed: no `jest-preset` export in the package,
and `react-native-css-interop@0.2.6` ships none either). The correct approach for this
repo:

1. **Keep `preset: 'jest-expo'`.** It already transforms with `babel-jest` using our
   `babel.config.js`, so the `jsxImportSource: 'nativewind'` + `nativewind/babel` preset
   (§8.2) run in tests automatically — `className` props are accepted, not rejected.
2. **Extend `transformIgnorePatterns`** to allow-list the new runtime package so it gets
   transpiled. Current pattern in `jest.config.js` must gain `nativewind` and
   `react-native-css-interop`:
   ```
   'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?|expo-router|@expo-google-fonts|react-navigation|@react-navigation|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop))',
   ```
3. **Why risk is low (confirmed by reading the suites):** all 67 suites assert via
   `testID` / visible text through React Native Testing Library — **none assert on
   `StyleSheet` output or resolved colors.** In jest there is no Metro CSS compilation, so
   `className` resolves to a no-op (no crash); rendered tree + testIDs are unchanged. The
   Detox testID guard (`src/testing/e2e-testid-guard.spec.ts`) is unaffected because
   testIDs stay on the elements.
4. **Coverage floors (86/73/88/86):** primitives add tested code; migrated screens lose
   `StyleSheet` objects (untested lines) — net coverage should hold or improve. Re-measure
   after the pilot.

**Caveat to verify on the pilot:** if any snapshot test exists that serializes style props,
NativeWind changes that output. Grep confirmed the suites are testID/text-based, but run the
full suite on the pilot screen (UX-P0-03) before declaring the transform safe.

### 8.7 Expo Go vs dev-build

- NativeWind v4 is **JS + Babel + Metro only — no native module**, so it works in **Expo
  Go** and in dev/release builds alike. It does **not** change the existing Expo-Go
  constraint, which is Mapbox: `@rnmapbox/maps` is a custom native module Expo Go can't
  load, hence the `EXPO_PUBLIC_FORCE_MOCK_MAP=1` escape hatch and the Metro mock. NativeWind
  adoption is orthogonal to that and must not disturb it (§8.3).
- `app.json` still carries `"RNMapboxMapsDownloadToken": "REPLACE_WITH_MAPBOX_DOWNLOAD_TOKEN"`
  — a real dev-build (the only way to see real maps) needs a real Mapbox download token.
  Unrelated to NativeWind, but it's the gating item for any on-device visual QA of the map
  screens (§7), so call it out in the screenshot workstream.

---

## 9. Backlog (sequenced NativeWind migration)

Shape mirrors `BACKLOG.md`: id, title, category, affected areas, priority
(UX-P0/P1/P2), effort (S/M/L). Ordered so every task lands with jest green + `tsc`/`eslint
--max-warnings 0` clean, per the CLAUDE.md verification bar.

### UX-P0 — Foundation (do first; unblocks everything)

| ID | Title | Category | Affected areas | Prio | Effort |
| --- | --- | --- | --- | --- | --- |
| **UX-P0-01** | Install & wire NativeWind v4 (babel jsxImportSource + preset; Metro `withNativeWind` **composed with the existing Mapbox resolver**; `global.css`; import in `app/_layout.tsx`) | infra | `babel.config.js`, `metro.config.js`, `app/_layout.tsx`, `global.css`, `package.json` | P0 | M |
| **UX-P0-02** | Define the token palette + radius/type scale in `tailwind.config.js` (§2.3); map all 37 hexes → tokens; collapse gray+slate to one neutral scale | design-system | `tailwind.config.js` | P0 | M |
| **UX-P0-03** | TS + jest wiring: commit auto-generated `nativewind-env.d.ts`; extend `transformIgnorePatterns` (nativewind + css-interop); **prove full 67-suite/~500-test run + tsc + eslint green** | infra/test | `tsconfig.json`, `jest.config.js`, `nativewind-env.d.ts` | P0 | S |
| **UX-P0-04** | Pilot migration of **`session-summary-screen`** to className + tokens; verify Mapbox mock (web + `FORCE_MOCK_MAP`) still resolves; re-measure coverage | migration | `src/features/sessions/session-summary-screen.tsx` | P0 | S |

> **UX-P0-01 + -03 together are the single highest-leverage first step.** They de-risk the
> two things that can break the build/tests (custom Metro resolver, jest transform) before
> any bulk work.

### UX-P1 — Shared primitives (build once, adopt everywhere)

| ID | Title | Category | Affected areas | Prio | Effort |
| --- | --- | --- | --- | --- | --- |
| **UX-P1-01** | `Button` (primary/secondary/danger/link) — pressed state, inline spinner, required `accessibilityLabel`, `min-h-11` target; source from session-summary | component | `src/components/ui/button.tsx` | P1 | M |
| **UX-P1-02** | `ScreenContainer` — bg token + `SafeAreaView` + optional scroll + `KeyboardAvoidingView` (fixes 0 safe-area / 0 keyboard-avoid) | component | `src/components/ui/screen-container.tsx` | P1 | M |
| **UX-P1-03** | `Card` — unified surface/border/radius token | component | `src/components/ui/card.tsx` | P1 | S |
| **UX-P1-04** | `StatusBadge` / `Pill` — encapsulate the FAILED/CANCELLED→danger, COMPLETED→primary status map; wrap-safe (no clip) | component | `src/components/ui/status-badge.tsx` | P1 | S |
| **UX-P1-05** | `FormField` / `TextInput` — label + input + inline error, `accessibilityLabel` required | component | `src/components/ui/form-field.tsx` | P1 | M |
| **UX-P1-06** | `StateViews` — `LoadingView` / `ErrorRetryView` / `EmptyState` (spinner uses `primary` token, not hardcoded) | component | `src/components/ui/state-views.tsx` | P1 | M |

### UX-P1/P2 — Screen migrations (dependency order; each kept green)

Order chosen so primitive consumers migrate after primitives exist, simplest first, map
screens (highest Mapbox/native risk) last:

| ID | Title | Affected screen(s) | Prio | Effort |
| --- | --- | --- | --- | --- |
| **UX-P1-07** | Migrate sessions flow | `charge-confirm`, `active-session`, `scan` | P1 | M |
| **UX-P1-08** | Migrate wallet + payments | `wallet-screen`, `payment-methods-screen`, onboarding `payment-method-screen` | P1 | M |
| **UX-P1-09** | Migrate onboarding (add keyboard-avoid via `ScreenContainer`) | `login`, `register`, `verify-phone`, `vehicle-setup` | P1 | M |
| **UX-P1-10** | Migrate profile + favorites | `profile-screen`, `favorites-screen` | P1 | S |
| **UX-P1-11** | Migrate forms | `review-form-screen`, `problem-report-screen` | P1 | S |
| **UX-P1-12** | Migrate station detail (fix stray `#14532D` CTA → `primary`) | `station-detail-screen` | P1 | S |
| **UX-P1-13** | Migrate map surface **last** (highest native risk) | `stations-screen`, `station-bottom-sheet`, `station-filters`, `station-search-input`, `station-marker` | P1 | L |
| **UX-P1-14** | Migrate utility components | `offline-banner`, `lazy-load-fallback`, `lazy-load-error-boundary` | P2 | S |

### UX-P2 — Cross-cutting polish

| ID | Title | Category | Affected areas | Prio | Effort |
| --- | --- | --- | --- | --- | --- |
| **UX-P2-01** | Accessibility pass — labels on all interactive elements, 44/48px targets, AA-contrast `text-muted`, `rem`/font-scaling audit | a11y | all migrated screens + primitives | P2 | M |
| **UX-P2-02** | Dark mode — `app.json` → `"automatic"`, dark token values, `dark:` variants where needed | design-system | `app.json`, `tailwind.config.js`, primitives | P2 | M |
| **UX-P2-03** | Armenian overflow testing — force-`hy` render tests / Detox screenshots of tab bar, charge-confirm/summary CTAs, status badges | i18n/test | test harness | P2 | M |
| **UX-P2-04** | Lightweight visual-regression / screenshot step in CI (extend `scripts/generate-screenshots.sh`; needs real `RNMapboxMapsDownloadToken` for map screens) | test/infra | `.github/workflows/*` (note: asserted by `apps/api/src/ci/workflows.spec.ts` — change in tandem), `app.json` | P2 | L |

### Migration risks (call-outs)

1. **Custom Metro resolver (Mapbox mock)** — `withNativeWind` must wrap the *finished*
   config so `resolver.resolveRequest` survives (§8.3). Broken map mock = broken Expo Go /
   web = release blocker. Verify explicitly in UX-P0-01/-04.
2. **Jest transform** — must add `nativewind` + `react-native-css-interop` to
   `transformIgnorePatterns`; verify no style-serializing snapshots exist (grep says none)
   on the pilot before bulk migration.
3. **Large mechanical diff** — 24 StyleSheet blocks / ~30 screens. Do it **screen-by-screen
   behind the primitives**, each landing green, never one big-bang PR. Coverage floors and
   the testID guard keep each step honest.
4. **`shared-types` build** — unrelated to NativeWind but required before mobile tsc/tests
   on fresh checkout (CLAUDE.md); don't let a red `tsc` be misattributed to NativeWind.

---

## 10. What this audit CANNOT assess (needs a human + devices)

Everything here is inferred from **source code**. Not assessable statically, and explicitly
out of scope of these findings:

- **Actual visual quality / aesthetics** — whether the teal-on-gray result looks *good*,
  spacing rhythm, visual hierarchy as rendered.
- **Brand fit** — is `#0F766E` teal the intended LiloCharge brand? No brand guide exists in
  repo; the palette in §2.3 rationalizes what's there, it does not validate it.
- **Real usability** — task success, flow friction, whether the two-tap charge flow *feels*
  fast; needs moderated testing.
- **On-device rendering** — real Mapbox maps (need a dev-build + real
  `RNMapboxMapsDownloadToken`), notch/safe-area on real hardware, keyboard behavior,
  Armenian glyph rendering at real sizes, screen-reader (VoiceOver/TalkBack) output, dynamic
  type at 200%.

**Recommended human step:** once UX-P0 + a few UX-P1 screens land, do a designer review +
device-screenshot pass (both light/dark, both `hy` longest-string and `en`, iOS + Android,
default + large font) using the UX-P2-04 screenshot pipeline. That is the only way to close
the gap between "consistent tokens" (what this migration delivers) and "well-designed" (what
still needs a designer).
