/**
 * Playwright global setup: autenticação via NextAuth / Keycloak.
 *
 * Salva o estado da sessão em e2e/.auth/user.json para reuso nos testes.
 * Evita re-login a cada test file.
 *
 * Usa credenciais do seed demo (TENANT_ADMIN).
 * NUNCA commitar credenciais de produção aqui.
 */
import { test as setup, expect } from '@playwright/test';

const KEYCLOAK_URL = process.env.E2E_KEYCLOAK_URL || 'http://localhost:8180';
const REALM        = process.env.E2E_KEYCLOAK_REALM  || 'gruahub';
const CLIENT_ID    = process.env.E2E_KEYCLOAK_CLIENT  || 'gruahub-web';
const TEST_USER    = process.env.E2E_TEST_USER  || 'operator@tenant1.com';
const TEST_PASS    = process.env.E2E_TEST_PASS  || 'op123';
const AUTH_FILE    = 'e2e/.auth/user.json';

setup('autenticar usuário de teste', async ({ page }) => {
  // Navega para o dashboard — NextAuth vai redirecionar para Keycloak
  await page.goto('/dashboard');

  // Aguarda o redirect para Keycloak e preenche credenciais
  await page.waitForURL(`${KEYCLOAK_URL}/realms/${REALM}/**`, { timeout: 15_000 });

  await page.getByLabel(/username|usuário/i).fill(TEST_USER);
  await page.getByLabel(/password|senha/i).fill(TEST_PASS);
  await page.getByRole('button', { name: /sign in|entrar|login/i }).click();

  // Aguarda redirect de volta para o dashboard após login
  await page.waitForURL('/dashboard', { timeout: 15_000 });
  await expect(page).toHaveURL('/dashboard');

  // Salva o estado de sessão (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });
});
