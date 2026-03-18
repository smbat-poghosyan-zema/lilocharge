/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/app', '<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?|expo-router|@expo-google-fonts|react-navigation|@react-navigation|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
  clearMocks: true,
};
