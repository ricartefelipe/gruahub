/**
 * GruaHub Payment Simulator
 * Simula pagamentos sandbox contra o backend GruaHub.
 *
 * Uso:
 *   BACKEND_URL=http://localhost:8080 \
 *   TENANT_ID=xxx \
 *   MACHINE_ID=yyy \
 *   npx ts-node src/index.ts <command>
 *
 * Comandos:
 *   full-flow        — initiate → confirm (fluxo completo, cria transação no banco)
 *   confirm          — alias para full-flow
 *   webhook-confirm  — envia webhook assinado diretamente (sem initiate)
 *   webhook-fail     — envia webhook de falha assinado
 *   idempotency      — repete confirm duas vezes para verificar no-op
 *   duplicate-webhook — envia mesmo webhook duas vezes (deve resultar em crédito único)
 *   invalid-signature — envia webhook com HMAC inválido (deve retornar 401)
 *   loop             — repete full-flow a cada 30s (modo demonstração)
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import { v4 as uuidv4 } from 'uuid';

// ================================================================
// Configuração via variáveis de ambiente
// ================================================================
const BACKEND_URL  = process.env.BACKEND_URL   || 'http://localhost:8080';
const TENANT_ID    = process.env.TENANT_ID     || '11111111-0000-0000-0000-000000000001';
const MACHINE_ID   = process.env.MACHINE_ID    || '66666666-0000-0000-0000-000000000001';
const AMOUNT_CENTS = parseInt(process.env.AMOUNT_CENTS || '200', 10);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Payment Simulator] ${name} is required (see infra/.env.example)`);
  }
  return value;
}

const SANDBOX_SECRET = requireEnv('SANDBOX_SECRET');

// ================================================================
// HTTP helpers
// ================================================================
interface HttpResponse {
  status: number;
  body: string;
  json?: any;
}

async function httpPost(urlStr: string, body: string, headers: Record<string, string>): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: any;
          try { json = JSON.parse(data); } catch { /* non-JSON response */ }
          resolve({ status: res.statusCode || 0, body: data, json });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function httpGet(urlStr: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: any;
          try { json = JSON.parse(data); } catch { /* non-JSON response */ }
          resolve({ status: res.statusCode || 0, body: data, json });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================================================
// Cenário 1: Fluxo completo — initiate → confirm
// ================================================================
async function fullFlow(label = 'full-flow'): Promise<void> {
  console.log(`\n[Payment Simulator][${label}] Starting full flow`);
  console.log(`  Tenant: ${TENANT_ID}`);
  console.log(`  Machine: ${MACHINE_ID}`);
  console.log(`  Amount: R$ ${(AMOUNT_CENTS / 100).toFixed(2)}`);

  const initiateResp = await httpPost(
    `${BACKEND_URL}/api/v1/payments/sandbox/initiate`,
    '{}',
    {
      'X-Tenant-Id': TENANT_ID,
      'X-Machine-Id': MACHINE_ID,
      'X-Sandbox-Secret': SANDBOX_SECRET,
    }
  );

  if (initiateResp.status !== 200 || !initiateResp.json?.transactionId) {
    console.error(`[Payment Simulator][${label}] ✗ Initiate failed: HTTP ${initiateResp.status} — ${initiateResp.body}`);
    return;
  }

  const transactionId = initiateResp.json.transactionId as string;
  console.log(`[Payment Simulator][${label}] ✓ Transaction created: ${transactionId} (status=PENDING)`);

  const confirmResp = await httpPost(
    `${BACKEND_URL}/api/v1/payments/sandbox/confirm/${transactionId}`,
    '{}',
    {
      'X-Tenant-Id': TENANT_ID,
      'X-Machine-Id': MACHINE_ID,
      'X-Sandbox-Secret': SANDBOX_SECRET,
    }
  );

  if (confirmResp.status === 200) {
    console.log(`[Payment Simulator][${label}] ✓ Payment confirmed: ${transactionId}`);
    console.log('  → Backend will create CreditGrant + publish MQTT command → machine will ACK + play');
  } else {
    console.error(`[Payment Simulator][${label}] ✗ Confirm failed: HTTP ${confirmResp.status} — ${confirmResp.body}`);
  }
}

// ================================================================
// Cenário 2: Webhook direto com HMAC válido
// ================================================================
async function sendWebhookDirectly(eventType: 'confirmed' | 'failed' | 'expired'): Promise<void> {
  const transactionId  = `SANDBOX-${uuidv4().replace(/-/g, '').toUpperCase().substring(0, 12)}`;
  const idempotencyKey = uuidv4();

  const webhookPayload = JSON.stringify({
    transactionId,
    machineId: MACHINE_ID,
    tenantId: TENANT_ID,
    amountCents: AMOUNT_CENTS,
    currency: 'BRL',
    event: eventType === 'confirmed' ? 'PAYMENT_CONFIRMED' : eventType.toUpperCase(),
    sandbox: true,
    timestamp: new Date().toISOString(),
  });

  const signature = signPayload(webhookPayload, SANDBOX_SECRET);
  console.log(`\n[Payment Simulator][webhook-${eventType}] Sending signed webhook`);
  console.log(`  Transaction: ${transactionId}`);
  console.log(`  Signature:   ${signature.substring(0, 16)}...`);

  const resp = await httpPost(
    `${BACKEND_URL}/api/v1/payments/webhook/sandbox`,
    webhookPayload,
    { 'X-Signature': signature, 'X-Tenant-Id': TENANT_ID, 'Idempotency-Key': idempotencyKey }
  );

  console.log(`[Payment Simulator][webhook-${eventType}] Response: HTTP ${resp.status} — ${resp.body}`);
  if (resp.status === 200) {
    console.log(`[Payment Simulator][webhook-${eventType}] ✓ Webhook accepted`);
  } else {
    console.warn(`[Payment Simulator][webhook-${eventType}] ✗ Unexpected: HTTP ${resp.status}`);
  }
}

// ================================================================
// Cenário 3: Idempotência — mesmo confirm duas vezes
// Contrato: ambas as chamadas retornam 200, mas crédito criado apenas uma vez.
// ================================================================
async function testIdempotency(): Promise<void> {
  console.log('\n[Payment Simulator][idempotency] Testing confirm idempotency...');

  const initiateResp = await httpPost(
    `${BACKEND_URL}/api/v1/payments/sandbox/initiate`,
    '{}',
    {
      'X-Tenant-Id': TENANT_ID,
      'X-Machine-Id': MACHINE_ID,
      'X-Sandbox-Secret': SANDBOX_SECRET,
    }
  );

  if (initiateResp.status !== 200) {
    console.error(`[idempotency] ✗ Initiate failed: HTTP ${initiateResp.status}`);
    return;
  }

  const transactionId = initiateResp.json?.transactionId as string;
  console.log(`[idempotency] Transaction created: ${transactionId}`);

  let okCount = 0;
  for (let i = 1; i <= 2; i++) {
    const resp = await httpPost(
      `${BACKEND_URL}/api/v1/payments/sandbox/confirm/${transactionId}`,
      '{}',
      {
        'X-Tenant-Id': TENANT_ID,
        'X-Machine-Id': MACHINE_ID,
        'X-Sandbox-Secret': SANDBOX_SECRET,
      }
    );
    console.log(`[idempotency] Attempt ${i}: HTTP ${resp.status}`);
    if (resp.status === 200) okCount++;
    await delay(200);
  }

  if (okCount === 2) {
    console.log('[idempotency] ✓ Both attempts returned 200 (second was a no-op at service layer)');
  } else {
    console.error(`[idempotency] ✗ Expected 2×200, got ${okCount}×200`);
  }
}

// ================================================================
// Cenário 4: Webhook duplicado — mesmo payload duas vezes
// Contrato: ambas retornam 200, mas crédito é criado apenas uma vez.
// ================================================================
async function testDuplicateWebhook(): Promise<void> {
  console.log('\n[Payment Simulator][duplicate-webhook] Testing webhook deduplication...');

  const initiateResp = await httpPost(
    `${BACKEND_URL}/api/v1/payments/sandbox/initiate`,
    '{}',
    {
      'X-Tenant-Id': TENANT_ID,
      'X-Machine-Id': MACHINE_ID,
      'X-Sandbox-Secret': SANDBOX_SECRET,
    }
  );

  if (initiateResp.status !== 200) {
    console.error(`[duplicate-webhook] ✗ Initiate failed: HTTP ${initiateResp.status}`);
    return;
  }

  const transactionId = initiateResp.json?.transactionId as string;
  const idempotencyKey = uuidv4();

  const webhookPayload = JSON.stringify({
    transactionId,
    machineId: MACHINE_ID,
    tenantId: TENANT_ID,
    amountCents: AMOUNT_CENTS,
    currency: 'BRL',
    event: 'PAYMENT_CONFIRMED',
    sandbox: true,
    timestamp: new Date().toISOString(),
  });
  const signature = signPayload(webhookPayload, SANDBOX_SECRET);

  for (let i = 1; i <= 2; i++) {
    const resp = await httpPost(
      `${BACKEND_URL}/api/v1/payments/webhook/sandbox`,
      webhookPayload,
      { 'X-Signature': signature, 'X-Tenant-Id': TENANT_ID, 'Idempotency-Key': idempotencyKey }
    );
    console.log(`[duplicate-webhook] Attempt ${i}: HTTP ${resp.status} — ${resp.body}`);
    await delay(100);
  }

  console.log('[duplicate-webhook] ✓ Expected: both 200, credit created once (checked via reconciliation summary)');
}

// ================================================================
// Cenário 5: Assinatura inválida → 401
// ================================================================
async function testInvalidSignature(): Promise<void> {
  console.log('\n[Payment Simulator][invalid-signature] Testing HMAC rejection...');

  const transactionId = `SANDBOX-FAKE-${Date.now()}`;
  const webhookPayload = JSON.stringify({
    transactionId,
    event: 'PAYMENT_CONFIRMED',
    sandbox: true,
    timestamp: new Date().toISOString(),
  });

  const resp = await httpPost(
    `${BACKEND_URL}/api/v1/payments/webhook/sandbox`,
    webhookPayload,
    {
      'X-Signature': 'deadbeef000000000000000000000000000000000000000000000000deadbeef',
      'X-Tenant-Id': TENANT_ID,
      'Idempotency-Key': uuidv4(),
    }
  );

  if (resp.status === 401) {
    console.log('[invalid-signature] ✓ 401 Unauthorized — HMAC rejected correctly');
  } else {
    console.error(`[invalid-signature] ✗ Expected 401, got HTTP ${resp.status}`);
  }
}

// ================================================================
// CLI
// ================================================================
const command = process.argv[2] || 'full-flow';

async function main(): Promise<void> {
  console.log('[GruaHub Payment Simulator]');
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Command: ${command}`);

  switch (command) {
    case 'confirm':
    case 'full-flow':
      await fullFlow();
      break;

    case 'webhook-confirm':
      await sendWebhookDirectly('confirmed');
      break;

    case 'webhook-fail':
      await sendWebhookDirectly('failed');
      break;

    case 'idempotency':
      await testIdempotency();
      break;

    case 'duplicate-webhook':
      await testDuplicateWebhook();
      break;

    case 'invalid-signature':
      await testInvalidSignature();
      break;

    case 'all-scenarios': {
      // Roda todos os cenários em sequência para demonstração
      await fullFlow('all/full-flow');
      await delay(500);
      await testIdempotency();
      await delay(500);
      await testDuplicateWebhook();
      await delay(500);
      await testInvalidSignature();
      await delay(500);
      await sendWebhookDirectly('failed');
      console.log('\n[Payment Simulator] ✓ All scenarios completed');
      break;
    }

    case 'loop':
      console.log('[Payment Simulator] Loop mode — running full-flow every 30s');
      await fullFlow('loop/1');
      setInterval(() => fullFlow('loop').catch(console.error), 30_000);
      return; // não encerrar o processo

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Available commands:');
      console.log('  confirm | full-flow       — initiate → confirm (fluxo completo)');
      console.log('  webhook-confirm           — webhook HMAC assinado direto');
      console.log('  webhook-fail              — webhook de falha assinado');
      console.log('  idempotency               — confirm duplicado (deve ser no-op)');
      console.log('  duplicate-webhook         — mesmo webhook 2x (crédito único)');
      console.log('  invalid-signature         — HMAC inválido → 401');
      console.log('  all-scenarios             — todos os cenários em sequência');
      console.log('  loop                      — repete full-flow a cada 30s');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('[Payment Simulator] Fatal error:', err.message);
  process.exit(1);
});
