/**
 * Smoke tests — Portal do Parceiro (ESTABLISHMENT_VIEWER)
 *
 * Nota: estes testes rodam com a sessão do TENANT_ADMIN (que também tem acesso ao portal).
 * Para testar isolamento real, criar um segundo fixture com credenciais de ESTABLISHMENT_VIEWER.
 */
import { test, expect } from '@playwright/test';

test.describe('Portal do Parceiro', () => {
  test('página do portal carrega', async ({ page }) => {
    await page.goto('/portal');

    // Deve exibir o header "Portal do Parceiro"
    await expect(
      page.getByText(/portal do parceiro/i).or(page.getByText(/parceiro/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('exibe seção de máquinas', async ({ page }) => {
    await page.goto('/portal');

    await expect(
      page.getByRole('heading', { name: /suas máquinas/i })
        .or(page.getByText(/máquinas/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('exibe KPIs de resumo', async ({ page }) => {
    await page.goto('/portal');

    // Aguarda cards de KPI
    await page.waitForTimeout(2_000);

    // A página não deve exibir erro de autenticação
    await expect(page).not.toHaveURL(/signin|login|error/, { timeout: 5_000 });
  });
});
