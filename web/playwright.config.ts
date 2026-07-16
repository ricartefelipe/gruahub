import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E — GruaHub Web
 *
 * Pré-requisito: stack local rodando (docker compose up + npm run dev)
 * Executar: npx playwright test
 *
 * Credenciais: usa usuário de teste com role TENANT_ADMIN do seed demo.
 * Não usa credenciais reais; nunca commitar senhas de produção neste arquivo.
 */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,        // serializado para evitar race conditions de sessão
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Ignorar erros de certificado TLS em ambientes de teste local
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Inicia o servidor Next.js automaticamente (opcional — desativar se já rodando)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
