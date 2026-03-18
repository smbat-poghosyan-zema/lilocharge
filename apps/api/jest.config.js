/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/load-tests'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.js'],
  clearMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/load-tests/results/'],
};
