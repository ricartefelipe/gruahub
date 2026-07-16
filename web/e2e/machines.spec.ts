/**
 * Smoke tests — Lista de máquinas e detalhe
 */
import { test, expect } from '@playwright/test';

test.describe('Máquinas', () => {
  test('lista de máquinas carrega', async ({ page }) => {
    await page.goto('/dashboard/machines');

    // Aguarda a tabela de máquinas ou mensagem de vazio
    await expect(
      page.locator('table, [role="table"]').or(page.getByText(/nenhuma máquina/i))
    ).toBeVisible({ timeout: 10_000 });
  });

  test('exibe asset numbers das máquinas do seed', async ({ page }) => {
    await page.goto('/dashboard/machines');

    // O seed cria GRUA-001 a GRUA-005
    await expect(page.getByText(/GRUA-00[1-5]/)).toBeVisible({ timeout: 10_000 });
  });

  test('navega para detalhe ao clicar na máquina', async ({ page }) => {
    await page.goto('/dashboard/machines');

    // Clica no primeiro link de detalhe (célula de asset number ou ícone)
    const machineLink = page.getByRole('link', { name: /GRUA-00[1-5]|Detalhe|Ver/i }).first();
    await expect(machineLink).toBeVisible({ timeout: 10_000 });
    await machineLink.click();

    // URL deve conter /dashboard/machines/<uuid>
    await expect(page).toHaveURL(/\/dashboard\/machines\/[0-9a-f-]{36}/, { timeout: 8_000 });
  });

  test('página de detalhe exibe abas', async ({ page }) => {
    await page.goto('/dashboard/machines');

    const machineLink = page.getByRole('link', { name: /GRUA-00[1-5]|Detalhe|Ver/i }).first();
    await machineLink.click();
    await page.waitForURL(/\/dashboard\/machines\/[0-9a-f-]{36}/);

    // Abas devem estar visíveis
    await expect(page.getByRole('button', { name: /informações/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /chamados/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /alertas/i })).toBeVisible();
  });

  test('formulário de nova máquina carrega', async ({ page }) => {
    await page.goto('/dashboard/machines/new');

    await expect(page.getByLabel(/asset number/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /criar máquina/i })).toBeVisible();
  });

  test('validação do formulário de nova máquina', async ({ page }) => {
    await page.goto('/dashboard/machines/new');

    // Submeter sem preencher o campo obrigatório
    await page.getByRole('button', { name: /criar máquina/i }).click();

    // Deve exibir mensagem de erro
    await expect(page.getByText(/obrigatório/i)).toBeVisible();
  });
});
