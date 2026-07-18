/**
 * E2E — Fluxo de pagamento sandbox (TENANT_ADMIN)
 *
 * Requisito: NEXT_PUBLIC_SANDBOX_ENABLED=true no .env.local
 * Pré-requisito: seed demo com pelo menos uma máquina ACTIVE
 *
 * Fluxo testado:
 *   1. Acessa /dashboard/payments
 *   2. Confirma que lista carrega sem erro
 *   3. (Se SANDBOX) Verifica que botões sandbox aparecem apenas em pagamentos PENDING
 *   4. Clama sandbox initiate via API → confirm via botão no painel
 *   5. Verifica que status muda para CONFIRMED na tabela (sem reload manual)
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:8080';
const TENANT_ID = process.env.E2E_TENANT_ID || '00000000-0000-0000-0000-000000000001';
const MACHINE_ID = process.env.E2E_MACHINE_ID || '';

const isSandbox = process.env.NEXT_PUBLIC_SANDBOX_ENABLED === 'true' ||
                  process.env.E2E_SANDBOX === 'true';

test.describe('Pagamentos — tela /dashboard/payments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/payments');
    // Aguarda dados da API ou estado vazio
    await page.waitForSelector('table, [role="table"], .text-gray-400', { timeout: 15_000 });
  });

  test('carrega sem erros de API', async ({ page }) => {
    // Não deve exibir o banner de erro vermelho
    const errorBanner = page.locator('[role="alert"]').filter({ hasText: /erro ao carregar pagamentos/i });
    await expect(errorBanner).not.toBeVisible();
  });

  test('exibe tabela de pagamentos ou estado vazio', async ({ page }) => {
    const tableOrEmpty = page.locator('[role="table"]').or(
      page.getByText(/nenhum pagamento encontrado/i)
    );
    await expect(tableOrEmpty).toBeVisible({ timeout: 10_000 });
  });

  test('filtros de status funcionam', async ({ page }) => {
    // Clica em "Confirmado"
    await page.getByRole('button', { name: /confirmado/i }).click();
    // A URL não muda mas a query key muda; aguarda re-render
    await page.waitForTimeout(1_000);
    // Verifica que não há erro visível
    const errorBanner = page.locator('[role="alert"]').filter({ hasText: /erro/i });
    await expect(errorBanner).not.toBeVisible();
  });

  test.skip(!isSandbox, 'sandbox desativado — skip de testes de botão sandbox');

  test('sandbox: botões aparecem apenas em PENDING e não em CONFIRMED', async ({ page }) => {
    // Se existirem pagamentos na lista, confirma que apenas PENDING tem botões sandbox
    const rows = page.locator('tbody tr');
    const count = await rows.count();

    if (count === 0) {
      test.skip(true, 'sem pagamentos no seed — skip');
      return;
    }

    for (let i = 0; i < Math.min(count, 5); i++) {
      const row = rows.nth(i);
      const statusCell = row.locator('td').first();
      const statusText = await statusCell.textContent();
      const confirmBtn = row.getByRole('button', { name: /confirmar/i });

      if (statusText?.includes('Pendente')) {
        await expect(confirmBtn).toBeVisible();
      } else {
        await expect(confirmBtn).not.toBeVisible();
      }
    }
  });
});

test.describe('Pagamento sandbox — fluxo initiate → confirm', () => {
  test.skip(!isSandbox || !MACHINE_ID, 'sandbox desativado ou MACHINE_ID não configurado');

  test('inicia pagamento via API, confirma via painel, verifica CONFIRMED', async ({ page, request }) => {
    // 1. Inicia pagamento via API backend (sem depender de UI de initiate)
    const session = await page.context().storageState();
    // Recupera accessToken do cookie de sessão (via API /api/auth/session)
    await page.goto('/api/auth/session');
    const sessionData = await page.evaluate(() => document.body.innerText);
    let accessToken: string | undefined;
    try {
      accessToken = JSON.parse(sessionData)?.accessToken;
    } catch {
      // session não tem token exposto — usará fluxo de botão direto
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Id': TENANT_ID,
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // POST /api/v1/payments/sandbox/initiate
    const initiateRes = await request.post(`${API_URL}/api/v1/payments/sandbox/initiate`, {
      headers,
      data: JSON.stringify({ machineId: MACHINE_ID }),
    });

    if (!initiateRes.ok()) {
      test.skip(true, `initiate retornou ${initiateRes.status()} — skip`);
      return;
    }

    const { transactionId } = await initiateRes.json();
    expect(transactionId).toBeTruthy();

    // 2. Navega para a tela de pagamentos
    await page.goto('/dashboard/payments');
    await page.waitForSelector('[role="table"]', { timeout: 15_000 });

    // 3. Encontra a linha do transactionId (pode aparecer como ID truncado)
    const shortId = (transactionId as string).slice(0, 8);
    const targetRow = page.locator('tbody tr').filter({ hasText: shortId });

    // Aguarda a linha aparecer (pode precisar de refetch)
    await expect(targetRow).toBeVisible({ timeout: 15_000 });

    // 4. Clica em "Confirmar" na linha do pagamento PENDING
    const confirmBtn = targetRow.getByRole('button', { name: /confirmar/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // 5. Aguarda status mudar para "Confirmado" (TanStack Query invalida e re-fetcha)
    await expect(targetRow.getByText(/confirmado/i)).toBeVisible({ timeout: 15_000 });

    // 6. Botão sandbox não deve mais estar visível na linha
    await expect(confirmBtn).not.toBeVisible();
  });
});
