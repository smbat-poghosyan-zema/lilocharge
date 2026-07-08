/**
 * The single design-token source for the LiloCharge mobile app.
 *
 * Semantic token names (primary/neutral/success/danger/warning/…) rather than raw hex so
 * a future rebrand or dark-mode value swap is a one-line change here. These collapse the
 * 37 ad-hoc hex colors the app previously spread across 24 per-screen StyleSheet blocks —
 * notably the two clashing neutral scales (Tailwind gray + slate) into one `neutral` scale
 * and the six spellings of green into `primary`/`success`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0F766E', 50: '#ECFDF5', 100: '#CCFBF1', 900: '#065F46' },
        neutral: {
          0: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          400: '#9CA3AF',
          500: '#6B7280',
          700: '#374151',
          900: '#111827',
        },
        success: { DEFAULT: '#16A34A', bg: '#DCFCE7' },
        danger: { DEFAULT: '#DC2626', bg: '#FEE2E2' },
        warning: { DEFAULT: '#D97706', bg: '#FEF3C7' },
        info: '#1D4ED8',
        accent: '#6D28D9',
        // Semantic aliases for the most common surface/text roles.
        background: '#F3F4F6',
        border: '#E5E7EB',
        text: { DEFAULT: '#111827', muted: '#6B7280' },
      },
      borderRadius: { sm: '10px', md: '12px', lg: '14px', xl: '18px' },
    },
  },
  plugins: [],
};
