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
  // Enforced floor for CI (backend.yml runs the unit project with --coverage;
  // coverageThreshold is a root-level jest option, so it applies to whichever
  // project runs with coverage — in practice the unit project only). Measured
  // on 2026-07-07 with `npx jest --selectProjects unit --coverage --ci`:
  // statements 89.89%, branches 76.30%, functions 91.21%, lines 89.56%
  // (83 suites / 656 tests). Floors sit ~5 points below the measured values so
  // the gate catches real coverage regressions without flaking on refactors.
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 71,
      functions: 86,
      lines: 85,
    },
  },
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
