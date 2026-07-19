import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    {
      name: 'setup-partner',
      testMatch: '**/auth.partner.setup.ts',
    },
    {
      name: 'chromium',
      testIgnore: ['**/smoke.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-partner',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/partner.json',
        extraHTTPHeaders: {},
      },
      env: {
        E2E_IS_PARTNER: 'true',
      },
      dependencies: ['setup-partner'],
      testMatch: ['**/security.spec.ts', '**/portal.spec.ts'],
    },
  ],

  webServer: process.env.E2E_WEB_SERVER === '1' ? {
    command: process.env.E2E_WEB_COMMAND || 'npm run start',
    url: process.env.E2E_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
});
