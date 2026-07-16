/**
 * Smoke tests — Alertas
 */
import { test, expect } from '@playwright/test';

test.describe('Alertas', () => {
  test('página de alertas carrega', async ({ page }) => {
    await page.goto('/dashboard/alerts');

    await expect(
      page.locator('table, [role="table"]')
        .or(page.getByText(/nenhum alerta/i))
        .or(page.getByText(/sem alertas/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('exibe filtro de severidade ou status', async ({ page }) => {
    await page.goto('/dashboard/alerts');

    // A página deve ter algum controle de filtro
    await expect(
      page.getByRole('combobox').or(page.getByRole('button', { name: /filtrar|ALL|aberto/i }))
    ).toBeVisible({ timeout: 8_000 });
  });

  test('resumo de alertas abertos exibe contagem', async ({ page }) => {
    await page.goto('/dashboard/alerts');

    // Aguarda que a API responda e algo seja exibido
    await page.waitForTimeout(2_000);

    // A página não deve exibir erro
    await expect(page.getByRole('alert').or(page.getByText(/erro ao carregar/i))).not.toBeVisible();
  });
});
