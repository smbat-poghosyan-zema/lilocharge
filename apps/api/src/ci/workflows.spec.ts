import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GitHub workflows', () => {
  const repositoryRootPath = resolve(process.cwd(), '../../');
  const backendWorkflowPath = resolve(repositoryRootPath, '.github/workflows/backend.yml');
  const mobileWorkflowPath = resolve(repositoryRootPath, '.github/workflows/mobile.yml');
  const easConfigPath = resolve(repositoryRootPath, 'apps/mobile/eas.json');

  it('defines backend workflow with lint, typecheck, test, and deploy jobs', () => {
    expect(existsSync(backendWorkflowPath)).toBe(true);

    const backendWorkflow = readFileSync(backendWorkflowPath, 'utf8');

    expect(backendWorkflow).toContain('name: Backend CI/CD');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api lint');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api typecheck');
    expect(backendWorkflow).toContain('pnpm --filter @lilocharge/api test');
    expect(backendWorkflow).toContain('deploy:');
    expect(backendWorkflow).toContain('BACKEND_DEPLOY_WEBHOOK_URL');
  });

  it('defines mobile workflow with EAS Build integration', () => {
    expect(existsSync(mobileWorkflowPath)).toBe(true);

    const mobileWorkflow = readFileSync(mobileWorkflowPath, 'utf8');

    expect(mobileWorkflow).toContain('name: Mobile CI/CD');
    expect(mobileWorkflow).toContain('pnpm --filter @lilocharge/mobile lint');
    expect(mobileWorkflow).toContain('pnpm --filter @lilocharge/mobile typecheck');
    expect(mobileWorkflow).toContain('pnpm --filter @lilocharge/mobile test');
    expect(mobileWorkflow).toContain('expo/expo-github-action');
    expect(mobileWorkflow).toContain(
      'eas build --platform all --non-interactive --profile preview',
    );
  });

  it('defines EAS build profiles for preview and production', () => {
    expect(existsSync(easConfigPath)).toBe(true);

    const easConfig = readFileSync(easConfigPath, 'utf8');

    expect(easConfig).toContain('"preview"');
    expect(easConfig).toContain('"production"');
  });
});
