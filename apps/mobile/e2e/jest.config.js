/**
 * Jest configuration for the Detox e2e runner.
 *
 * Two suites live under e2e/:
 * - e2e/flows/*.e2e.ts          — functional flow tests (run these in CI)
 * - e2e/screenshots/*.test.ts   — store screenshot generation + config checks
 *
 * Run a single suite by passing its path to `detox test`, e.g.
 * `detox test --configuration android.emu.release e2e/flows`.
 */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/flows/**/*.e2e.ts', '<rootDir>/e2e/screenshots/**/*.test.ts'],
  testTimeout: 180000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/e2e/tsconfig.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
