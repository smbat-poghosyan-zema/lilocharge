import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns a successful health response', () => {
    const controller = new HealthController();
    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('lilocharge-api');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('uses configured APP_NAME when provided', () => {
    const previousAppName = process.env.APP_NAME;
    process.env.APP_NAME = 'lilocharge-api-test';

    const controller = new HealthController();
    const result = controller.getHealth();

    expect(result.service).toBe('lilocharge-api-test');

    process.env.APP_NAME = previousAppName;
  });
});
