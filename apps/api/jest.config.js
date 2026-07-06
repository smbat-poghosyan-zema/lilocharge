/**
 * Jest is split into two projects so `pnpm test` stays fast and hermetic:
 * - `unit`: everything except *.e2e.spec.ts; no external services required.
 * - `e2e`: only *.e2e.spec.ts; requires the test stack (Postgres on :5437, Redis on :6382 — see
 *   infrastructure/docker/docker-compose.test.yml) and must run serially (`--runInBand`, applied
 *   by the `test:e2e` script) because suites share one database and fixed OCPP ports.
 */
const sharedConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
};

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      ...sharedConfig,
      displayName: 'unit',
      roots: ['<rootDir>/src', '<rootDir>/load-tests'],
      testMatch: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.js'],
      testPathIgnorePatterns: ['/node_modules/', '/load-tests/results/', '\\.e2e\\.spec\\.ts$'],
    },
    {
      ...sharedConfig,
      displayName: 'e2e',
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.e2e.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/'],
    },
  ],
};
