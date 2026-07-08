/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // store-assets is included so store-assets/metadata/metadata.test.ts (which
  // validates the store listing JSON against App Store/Play Store limits) runs
  // with the normal suite instead of being orphaned outside every jest root.
  roots: ['<rootDir>/app', '<rootDir>/src', '<rootDir>/store-assets'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?|expo-router|@expo-google-fonts|react-navigation|@react-navigation|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop))',
  ],
  clearMocks: true,
  // Enforced floor for CI (mobile.yml runs jest with --coverage). Measured on
  // 2026-07-07: statements 91.69%, branches 78.96%, functions 93.57%,
  // lines 91.64% (67 suites / 512 tests). Floors sit ~5 points below the
  // measured values so the gate catches real coverage regressions without
  // flaking on ordinary refactors.
  coverageThreshold: {
    global: {
      statements: 86,
      branches: 73,
      functions: 88,
      lines: 86,
    },
  },
};
