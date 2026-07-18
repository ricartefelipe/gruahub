/**
 * Playwright setup: autenticação como ESTABLISHMENT_VIEWER (parceiro/portal).
 *
 * Salva sessão separada em e2e/.auth/partner.json.
 * Usado pelo projeto "chromium-partner" no playwright.config.ts.
 *
 * Credenciais: seed demo — parceiro@shoppingbv.demo / gruahub@2025
 */
import { test as setup, expect } from '@playwright/test';

const KEYCLOAK_URL  = process.env.E2E_KEYCLOAK_URL   || 'http://localhost:8180';
const REALM         = process.env.E2E_KEYCLOAK_REALM  || 'gruahub';
const PARTNER_USER  = process.env.E2E_PARTNER_USER    || 'parceiro@shoppingbv.demo';
const PARTNER_PASS  = process.env.E2E_PARTNER_PASS    || 'gruahub@2025';
const AUTH_FILE     = 'e2e/.auth/partner.json';

setup('autenticar parceiro (ESTABLISHMENT_VIEWER)', async ({ page }) => {
  // O portal redireciona para Keycloak se não autenticado
  await page.goto('/portal');

  await page.waitForURL(`${KEYCLOAK_URL}/realms/${REALM}/**`, { timeout: 15_000 });

  await page.getByLabel(/username|usuário/i).fill(PARTNER_USER);
  await page.getByLabel(/password|senha/i).fill(PARTNER_PASS);
  await page.getByRole('button', { name: /sign in|entrar|login/i }).click();

  // Após login com role ESTABLISHMENT_VIEWER, redireciona para /portal
  await page.waitForURL('/portal', { timeout: 15_000 });
  await expect(page).toHaveURL('/portal');

  await page.context().storageState({ path: AUTH_FILE });
});
