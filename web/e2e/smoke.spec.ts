import { test, expect } from '@playwright/test';

test.describe('Smoke (sem autenticação)', () => {
  test('página de login renderiza marca e CTA SSO', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'GruaHub' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /entrar com keycloak sso|entrar com sso/i })).toBeVisible();
  });

  test('dashboard sem sessão redireciona para login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
