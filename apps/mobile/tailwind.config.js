/**
 * The single design-token source for the LiloCharge mobile app.
 *
 * Semantic token names (primary/neutral/success/danger/warning/…) rather than raw hex so
 * a future rebrand or dark-mode value swap is a one-line change here. These collapse the
 * 37 ad-hoc hex colors the app previously spread across 24 per-screen StyleSheet blocks —
 * notably the two clashing neutral scales (Tailwind gray + slate) into one `neutral` scale
 * and the six spellings of green into `primary`/`success`.
 *
 * DARK MODE (UX-P2-02): every semantic token is defined as `rgb(var(--…) / <alpha-value>)`
 * and the actual channel values live as CSS custom properties in `global.css`, with a
 * `@media (prefers-color-scheme: dark)` block overriding them. This keeps the token NAMES
 * stable — `bg-background`, `text-text`, `bg-neutral-0` (surface), `text-neutral-900`
 * (body) all flip automatically when the device switches scheme, so screens inherit dark
 * mode without per-screen edits. `darkMode: 'media'` matches that media query.
 *
 * Two roles that the neutral scale historically overloaded are pinned to NON-inverting
 * tokens so they stay correct in both schemes:
 *   • `white` (Tailwind default) — foreground text/borders that sit ON a saturated color
 *     (buttons, banners, selected chips). Was `text-neutral-0` / `border-neutral-0`.
 *   • `ink` — a permanently-dark chip/box background (map controls, the scan camera box,
 *     gateway badges). Was `bg-neutral-900`.
 * In light mode both equal their former neutral values (#FFFFFF / #111827) so the swap is
 * a visual no-op; they simply do not flip in dark mode, unlike the `neutral` scale.
 *
 * @type {import('tailwindcss').Config}
 */

/** Builds an `rgb(var(--token) / <alpha-value>)` color so Tailwind opacity modifiers work. */
function tokenColor(variableName) {
  return `rgb(var(${variableName}) / <alpha-value>)`;
}

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: tokenColor('--color-primary'),
          50: tokenColor('--color-primary-50'),
          100: tokenColor('--color-primary-100'),
          900: tokenColor('--color-primary-900'),
        },
        neutral: {
          0: tokenColor('--color-neutral-0'),
          50: tokenColor('--color-neutral-50'),
          100: tokenColor('--color-neutral-100'),
          200: tokenColor('--color-neutral-200'),
          400: tokenColor('--color-neutral-400'),
          500: tokenColor('--color-neutral-500'),
          700: tokenColor('--color-neutral-700'),
          900: tokenColor('--color-neutral-900'),
        },
        success: {
          DEFAULT: tokenColor('--color-success'),
          bg: tokenColor('--color-success-bg'),
          // Light foreground used only under `dark:` for legible badge text on the dark
          // success-bg tint. Fixed (does not flip).
          100: '#BBF7D0',
        },
        danger: {
          DEFAULT: tokenColor('--color-danger'),
          bg: tokenColor('--color-danger-bg'),
          100: '#FECACA',
        },
        warning: {
          DEFAULT: tokenColor('--color-warning'),
          bg: tokenColor('--color-warning-bg'),
          100: '#FDE68A',
        },
        info: tokenColor('--color-info'),
        accent: tokenColor('--color-accent'),
        // Semantic aliases for the most common surface/text roles.
        background: tokenColor('--color-background'),
        border: tokenColor('--color-border'),
        text: {
          DEFAULT: tokenColor('--color-text'),
          muted: tokenColor('--color-text-muted'),
        },
        // Permanently-dark chip/box surface (never inverts). See file header.
        ink: '#111827',
      },
      borderRadius: { sm: '10px', md: '12px', lg: '14px', xl: '18px' },
    },
  },
  plugins: [],
};
