import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GitHub workflows', () => {
  const repositoryRootPath = resolve(process.cwd(), '../../');
  const backendWorkflowPath = resolve(repositoryRootPath, '.github/workflows/backend.yml');
  const mobileWorkflowPath = resolve(repositoryRootPath, '.github/workflows/mobile.yml');
  const easConfigPath = resolve(repositoryRootPath, 'apps/mobile/eas.json');
  const apiPackageJsonPath = resolve(repositoryRootPath, 'apps/api/package.json');

  it('defines backend workflow with lint, typecheck, coverage-gated unit tests, e2e, and deploy jobs', () => {
    expect(existsSync(backendWorkflowPath)).toBe(true);

    const backendWorkflow = readFileSync(backendWorkflowPath, 'utf8');

    expect(backendWorkflow).toContain('name: Backend CI/CD');
    expect(backendWorkflow).toContain('pnpm install --frozen-lockfile');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/shared-types build');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api lint');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api typecheck');
    // Unit tests must run with coverage so the coverageThreshold floor in
    // apps/api/jest.config.js is actually enforced in CI.
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api test:cov -- --ci');
    expect(backendWorkflow).toContain('deploy:');
    expect(backendWorkflow).toContain('BACKEND_DEPLOY_WEBHOOK_URL');
  });

  it('runs backend e2e against service containers mirroring docker-compose.test.yml', () => {
    const backendWorkflow = readFileSync(backendWorkflowPath, 'utf8');

    // Same image, database name, credentials, and host ports as
    // infrastructure/docker/docker-compose.test.yml (the e2e suites hardcode
    // localhost:5437 / localhost:6382).
    expect(backendWorkflow).toContain('image: timescale/timescaledb-ha:pg16');
    expect(backendWorkflow).toContain('POSTGRES_DB: lilocharge_test');
    expect(backendWorkflow).toContain('5437:5432');
    expect(backendWorkflow).toContain('image: redis:7-alpine');
    expect(backendWorkflow).toContain('6382:6379');
    expect(backendWorkflow).toContain('prisma migrate deploy');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api test:e2e');
  });

  it('keeps CI lint non-mutating (no --fix) so violations fail instead of being silently repaired', () => {
    const apiPackageJson = JSON.parse(readFileSync(apiPackageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(apiPackageJson.scripts.lint).not.toContain('--fix');
    expect(apiPackageJson.scripts.lint).toContain('--max-warnings 0');
    // Auto-fixing stays available locally under a separate name.
    expect(apiPackageJson.scripts['lint:fix']).toContain('--fix');
  });

  it('defines mobile workflow with shared-types built before typecheck/test, coverage, and EAS integration', () => {
    expect(existsSync(mobileWorkflowPath)).toBe(true);

    const mobileWorkflow = readFileSync(mobileWorkflowPath, 'utf8');

    expect(mobileWorkflow).toContain('name: Mobile CI/CD');
    expect(mobileWorkflow).toContain('pnpm install --frozen-lockfile');
    expect(mobileWorkflow).toContain('pnpm --filter @lilocharge/mobile lint');
    expect(mobileWorkflow).toContain('pnpm --filter @lilocharge/mobile typecheck');
    // Coverage flag so the coverageThreshold floor in
    // apps/mobile/jest.config.js is enforced in CI.
    expect(mobileWorkflow).toContain('pnpm --filter @lilocharge/mobile test -- --ci --coverage');
    expect(mobileWorkflow).toContain('expo/expo-github-action');
    expect(mobileWorkflow).toContain(
      'eas build --platform all --non-interactive --profile preview',
    );

    // Regression guard for the historical fresh-checkout break: shared-types
    // must be built before mobile typecheck and jest run.
    const sharedTypesBuildIndex = mobileWorkflow.indexOf(
      'pnpm --filter @lilocharge/shared-types build',
    );
    const typecheckIndex = mobileWorkflow.indexOf('pnpm --filter @lilocharge/mobile typecheck');
    const testIndex = mobileWorkflow.indexOf('pnpm --filter @lilocharge/mobile test');
    expect(sharedTypesBuildIndex).toBeGreaterThan(-1);
    expect(sharedTypesBuildIndex).toBeLessThan(typecheckIndex);
    expect(sharedTypesBuildIndex).toBeLessThan(testIndex);
  });

  it('defines EAS build profiles for preview and production', () => {
    expect(existsSync(easConfigPath)).toBe(true);

    const easConfig = readFileSync(easConfigPath, 'utf8');

    expect(easConfig).toContain('"preview"');
    expect(easConfig).toContain('"production"');
  });
});
