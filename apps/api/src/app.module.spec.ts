import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from './app.module';

describe('AppModule', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/lilocharge_test';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
  });

  it('compiles root module with imported feature modules', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});
