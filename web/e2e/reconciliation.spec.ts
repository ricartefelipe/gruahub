/**
 * E2E — Tela de Conciliação /dashboard/reconciliation
 *
 * Testa:
 * - Carregamento da tela
 * - Cards de resumo por status
 * - Filtragem por status
 * - Modal de resolução manual (UI, não persiste)
 * - Sem erros de API visíveis
 */
import { test, expect } from '@playwright/test';

test.describe('Conciliação — tela /dashboard/reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/reconciliation');
    // Aguarda dados ou estado vazio
    await page.waitForSelector('[role="table"], .text-gray-400', { timeout: 15_000 });
  });

  test('carrega sem erro de API', async ({ page }) => {
    const errorBanner = page.locator('[role="alert"]').filter({ hasText: /erro ao carregar casos/i });
    await expect(errorBanner).not.toBeVisible();
  });

  test('exibe tabela de casos ou estado vazio', async ({ page }) => {
    const tableOrEmpty = page.locator('[role="table"]').or(
      page.getByText(/nenhum caso encontrado/i)
    );
    await expect(tableOrEmpty).toBeVisible({ timeout: 10_000 });
  });

  test('filtra por status MATCHED', async ({ page }) => {
    const select = page.getByLabel(/filtrar por status/i);
    await select.selectOption('MATCHED');
    await page.waitForTimeout(1_000);

    // Não deve aparecer banner de erro
    const errorBanner = page.locator('[role="alert"]').filter({ hasText: /erro/i });
    await expect(errorBanner).not.toBeVisible();
  });

  test('exibe cards de resumo quando há dados', async ({ page }) => {
    // Se existirem dados de reconciliação, os cards de summary aparecem
    const summaryCards = page.locator('button[aria-pressed]').filter({ hasText: /conciliado|pendente|pagamento/i });
    const cardCount = await summaryCards.count();

    if (cardCount > 0) {
      // Clicar em um card filtra a tabela
      await summaryCards.first().click();
      await page.waitForTimeout(500);
      // Limpar filtro
      await page.getByRole('button', { name: /limpar filtro/i }).click();
    }
    // Se não houver cards (sem dados), verifica que a tabela existe
    const table = page.locator('[role="table"]');
    await expect(table).toBeVisible({ timeout: 8_000 });
  });

  test('modal de resolução abre e fecha', async ({ page }) => {
    // Verifica se existe algum botão "Resolver" (casos pendentes)
    const resolveBtn = page.getByRole('button', { name: /resolver/i }).first();
    const resolveBtnCount = await resolveBtn.count();

    if (resolveBtnCount === 0) {
      // Sem casos pendentes no seed atual — skip suave
      return;
    }

    await resolveBtn.click();

    // Modal deve aparecer
    const modal = page.getByRole('dialog', { name: /resolver manualmente/i });
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Textarea de motivo deve estar presente
    await expect(page.getByLabel(/motivo da resolução/i)).toBeVisible();

    // Botão confirmar desabilitado sem texto
    const confirmBtn = modal.getByRole('button', { name: /confirmar/i });
    await expect(confirmBtn).toBeDisabled();

    // Fechar com Cancelar
    await modal.getByRole('button', { name: /cancelar/i }).click();
    await expect(modal).not.toBeVisible();
  });

  test('modal de resolução valida campo obrigatório', async ({ page }) => {
    const resolveBtn = page.getByRole('button', { name: /resolver/i }).first();
    if (await resolveBtn.count() === 0) return;

    await resolveBtn.click();

    const modal = page.getByRole('dialog');
    const confirmBtn = modal.getByRole('button', { name: /confirmar/i });

    // Sem texto: botão desabilitado
    await expect(confirmBtn).toBeDisabled();

    // Com texto: botão habilitado
    await page.getByLabel(/motivo/i).fill('Resolução de teste E2E');
    await expect(confirmBtn).toBeEnabled();

    // Fechar sem salvar
    await modal.getByRole('button', { name: /cancelar/i }).click();
  });
});
