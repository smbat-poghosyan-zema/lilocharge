# Dark mode, accessibility & visual regression (UX-P2)

Scope: `apps/mobile`. Implements UX-AUDIT §9 tasks UX-P2-01..04. This documents the
decisions an agent/human needs to extend or QA the work.

## UX-P2-02 — Dark mode

### Approach chosen: CSS custom properties + a `prefers-color-scheme` override

`tailwind.config.js` defines every semantic color as
`rgb(var(--color-… ) / <alpha-value>)`. The channel values live in `global.css` as CSS
custom properties, with a `@media (prefers-color-scheme: dark)` block that overrides the
same variables. `darkMode: 'media'` matches that query, and NativeWind maps it onto the
React Native device color scheme (`useColorScheme` / `Appearance`).

Why this over per-primitive `dark:` variants:

- **Token names stay stable.** `bg-background`, `text-text`, `bg-neutral-0` (surface),
  `text-neutral-900` (body) all flip automatically when the scheme changes, so **screens
  inherit dark mode with no per-screen edits** — only the values change, never the names.
- **Works with NativeWind v4 + RN**, and the opacity modifiers already in use
  (`bg-neutral-0/95`, `bg-accent/10`) keep working because the tokens carry the
  `<alpha-value>` placeholder.
- **Testable** — see the guard below.

`app.json` `userInterfaceStyle` was switched `light → automatic` so the OS scheme reaches
the app.

### The overloaded-neutral problem and how it was solved

The neutral scale was used for **both** foreground and background roles, which cannot be
inverted with a single variable. These roles were moved to **non-inverting** tokens
(a visual no-op in light mode, since the values match) so the rest of the scale can invert
cleanly:

| Old class | New class | Role | Dark behavior |
| --- | --- | --- | --- |
| `text-neutral-0`, `text-neutral-50`, `text-neutral-200` | `text-white` | light text ON a saturated/dark surface | stays white |
| `border-neutral-0` | `border-white` | white ring on map pins | stays white |
| `bg-neutral-900` | `bg-ink` (fixed `#111827`) | permanently-dark chip/box (map controls, scan camera box, gateway badges) | stays dark |

Everything else in the `neutral` scale inverts (surfaces darken, body/secondary/muted text
lightens).

### Token mapping (light → dark)

Full values are in `global.css`. Highlights:

- **Surfaces/bg**: `neutral-0` #FFFFFF→#1F2937, `background`/`neutral-100` #F3F4F6→#111827,
  `neutral-50` #F9FAFB→#273244, `border`/`neutral-200` #E5E7EB→#374151.
- **Text**: `text`/`neutral-900` #111827→#F9FAFB, `neutral-700` #374151→#D1D5DB,
  `text-muted`/`neutral-500` #626B78→#9CA3AF.
- **Primary teal** stays `#0F766E` (pairs with white on filled buttons in both schemes);
  its tints flip (`primary-50` #ECFDF5→#134E4A, `primary-100`→#115E59, `primary-900`
  #065F46→#99F6E4, a light teal used for teal-on-dark text).
- **success/danger/warning/info/accent DEFAULT** stay saturated (white text pairs on
  solid buttons/banners/dots); their `-bg` tints go dark (`danger-bg` #FEE2E2→#7F1D1D,
  etc.). Tinted badges/pills use `dark:text-*-100` (a fixed light shade) so text stays
  legible on the dark tint. See `StatusBadge`, and the logout / remove-favorite /
  remove-photo pills.

### Native color-prop APIs

`ActivityIndicator`, `TextInput` `placeholderTextColor`, etc. cannot read a className, so
`src/theme/use-theme-colors.ts` (`useThemeColors`) returns scheme-aware literals mirroring
the tokens. Consumed by `Button` (spinner), `FormField` (placeholder), `LoadingView`
(spinner). `src/theme/colors.ts` still holds the static literals for the Mapbox layer
`style` objects and other non-reactive call sites.

### Test guard

`src/components/ui/dark-mode.spec.tsx` mocks
`react-native/Libraries/Utilities/useColorScheme` and asserts `useThemeColors` + the
FormField placeholder flip, that every primitive renders under the dark scheme without
crashing, and that dark-aware classes are present. (className→CSS resolution is a Metro
runtime step jest does not run, so the pixel-level flip is verified by screenshots below.)

## UX-P2-01 — Accessibility

- **Labels**: `accessibilityLabel` added to icon-only / short-text interactive controls
  that lacked one — profile nav rows + language options + logout, station filter chips
  (connector/availability/operator) + clear + power steps, the map filter-toggle /
  offline-download / focus / recenter buttons, the bottom-sheet favorite/close pills,
  station-detail write-review / report-problem / report-status controls, favorites remove,
  review remove-photo. Where text is visible the label mirrors it (reusing existing i18n
  keys, so key-parity — a `typeof hyCommon` compile check — is untouched). `Button` and
  `FormField` already require a label by API.
- **Touch targets**: `min-h-11` (44px) added to those same controls (chips, pills, rows,
  power steps, stars get `min-w-11`), centered with `items-center justify-center`. `Button`
  already carried `min-h-11`.
- **Contrast**: `text-muted` / `neutral-500` were `#6B7280` = **4.39:1** on the `#F3F4F6`
  background (below WCAG AA 4.5:1). Darkened to **#626B78 (~4.9:1)** in
  `global.css` + `src/theme/colors.ts` (`NEUTRAL_500`). Dark-mode muted `#9CA3AF` is ~7:1.
- **Font scaling**: no `allowFontScaling={false}` exists (verified); the only
  `numberOfLines` is the map pin label (`station-marker`, intentional). Interactive
  elements use `min-h`, not fixed heights, so large-type text is not clipped.
- **Safe area**: migrated screens go through `ScreenContainer` (`SafeAreaView` +
  optional `KeyboardAvoidingView`); the tab bar insets are handled by React Navigation.

## UX-P2-03 — Armenian overflow

`src/testing/armenian-overflow.spec.tsx` forces `i18n.changeLanguage('hy')` and asserts the
highest-risk elements render their full hy text with no clipping props: the tab labels, the
charge-confirm CTA (`sessions.confirm.start`), the summary receipt CTA
(`sessions.summary.receipt`), a long status badge, and the filter chips (incl. a long
operator name). RN does not truncate text without `numberOfLines`, so the test asserts none
is set on these token-migrated components and that badges are not `overflow-hidden` pills.

**Limitation**: this is a layout-resilience guard, not a pixel check. True visual overflow
(text spilling its container on a narrow device) needs on-device / screenshot review — see
below.

## UX-P2-04 — Visual regression

Two layers:

1. **Cheap jest net (runs in CI today)** —
   `src/components/ui/primitives-visual.spec.tsx` snapshots every primitive rendered under
   light **and** dark schemes. It runs inside the normal
   `npx jest --coverage` step of `.github/workflows/mobile.yml` — **no workflow change was
   needed**, so `apps/api/src/ci/workflows.spec.ts` (which asserts workflow contents) is
   unaffected. Deterministic (no timers/network) → non-flaky. Update intentionally with
   `npx jest -u src/components/ui/primitives-visual.spec.tsx`.

2. **On-device screenshots (manual / emulator)** — `e2e/screenshots/` (Detox) now iterates
   `COLOR_SCHEMES × LOCALES` (light/dark × hy/ru/en) via `device.setAppearance`, writing
   `<scheme>_<locale>_<n>_<screen>.png`. `getScreenshotOutputDir(platform, locale, scheme)`
   nests a per-scheme folder (the 2-arg call is unchanged for back-compat).

   ### Runbook
   Requirements: a booted iOS simulator / Android emulator, a Detox dev build, and a **real
   `RNMapboxMapsDownloadToken`** in `app.json` (currently the placeholder
   `REPLACE_WITH_MAPBOX_DOWNLOAD_TOKEN`) — without it the map screen renders blank.

   ```bash
   cd apps/mobile
   # iOS (or android):
   bash scripts/generate-screenshots.sh ios clean
   # → store-assets/screenshots/<platform>/<locale>/<scheme>/…
   ```

   Full Detox is not wired into CI (no emulator + no Mapbox token in CI); the jest snapshot
   guard is the CI regression net, and this runbook is the higher-fidelity manual pass for
   release QA (both schemes, all three locales, incl. hy longest strings).

## What still needs a human + device

Real aesthetics, the CSS-variable flip rendered on a device, screen-reader (VoiceOver /
TalkBack) output, dynamic type at 200%, and Armenian glyphs at real sizes. Fine dark-mode
contrast tuning of accent/teal text-on-surface should be confirmed on-device.
