/**
 * GruaHub Payment Simulator
 * Envia webhooks de pagamento assinados para o backend sandbox.
 *
 * Uso:
 *   BACKEND_URL=http://localhost:8080 \
 *   TENANT_ID=xxx \
 *   MACHINE_ID=yyy \
 *   npm run dev
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import { v4 as uuidv4 } from 'uuid';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const SANDBOX_SECRET = process.env.SANDBOX_SECRET || 'sandbox-webhook-secret-gruahub-demo';
const TENANT_ID = process.env.TENANT_ID || '11111111-0000-0000-0000-000000000001';
const MACHINE_ID = process.env.MACHINE_ID || '66666666-0000-0000-0000-000000000001';
const AMOUNT_CENTS = parseInt(process.env.AMOUNT_CENTS || '200', 10);

// ================================================================
// Funções auxiliares
// ================================================================
function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function httpPost(urlStr: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
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
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ================================================================
// Simulações
// ================================================================
async function createAndConfirmPayment(): Promise<void> {
  const transactionId = `SANDBOX-${uuidv4().replace(/-/g, '').toUpperCase().substring(0, 12)}`;
  const idempotencyKey = uuidv4();

  console.log(`\n[Payment Simulator] Creating transaction: ${transactionId}`);
  console.log(`[Payment Simulator] Tenant: ${TENANT_ID} | Machine: ${MACHINE_ID} | Amount: R$ ${(AMOUNT_CENTS / 100).toFixed(2)}`);

  // Confirmar via endpoint sandbox do backend
  const confirmUrl = `${BACKEND_URL}/api/v1/payments/sandbox/confirm/${transactionId}`;
  const { status, body } = await httpPost(confirmUrl, '{}', {
    'X-Tenant-Id': TENANT_ID,
    'Idempotency-Key': idempotencyKey,
  });

  console.log(`[Payment Simulator] Confirm response: HTTP ${status} — ${body}`);

  if (status === 200) {
    console.log(`[Payment Simulator] ✓ Payment confirmed! Transaction: ${transactionId}`);
    console.log('[Payment Simulator] → Backend will create credit and send MQTT command to machine');
  } else {
    console.error(`[Payment Simulator] ✗ Unexpected status: ${status}`);
  }
}

async function sendWebhookDirectly(eventType: 'confirmed' | 'failed' | 'expired'): Promise<void> {
  const transactionId = `SANDBOX-${uuidv4().replace(/-/g, '').toUpperCase().substring(0, 12)}`;
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
  console.log(`\n[Payment Simulator] Sending ${eventType} webhook for transaction ${transactionId}`);
  console.log(`[Payment Simulator] Signature: ${signature.substring(0, 16)}...`);

  const webhookUrl = `${BACKEND_URL}/api/v1/payments/webhook/sandbox`;
  const { status, body } = await httpPost(webhookUrl, webhookPayload, {
    'X-Signature': signature,
    'X-Tenant-Id': TENANT_ID,
    'Idempotency-Key': idempotencyKey,
  });

  console.log(`[Payment Simulator] Webhook response: HTTP ${status} — ${body}`);
}

async function testIdempotency(): Promise<void> {
  console.log('\n[Payment Simulator] Testing idempotency — sending same event twice...');
  const transactionId = `SANDBOX-IDEM-${Date.now()}`;
  const idempotencyKey = uuidv4();

  for (let i = 1; i <= 2; i++) {
    const confirmUrl = `${BACKEND_URL}/api/v1/payments/sandbox/confirm/${transactionId}`;
    const { status } = await httpPost(confirmUrl, '{}', {
      'X-Tenant-Id': TENANT_ID,
      'Idempotency-Key': idempotencyKey,
    });
    console.log(`[Payment Simulator] Attempt ${i}: HTTP ${status}`);
    await delay(200);
  }
  console.log('[Payment Simulator] Both attempts should return 200 — second is a no-op');
}

// ================================================================
// CLI simples
// ================================================================
const command = process.argv[2] || 'confirm';

async function main(): Promise<void> {
  console.log('[GruaHub Payment Simulator]');
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Command: ${command}\n`);

  switch (command) {
    case 'confirm':
      await createAndConfirmPayment();
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
    case 'loop':
      console.log('[Payment Simulator] Running in loop mode — confirming payment every 30s');
      await createAndConfirmPayment();
      setInterval(createAndConfirmPayment, 30000);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Available: confirm | webhook-confirm | webhook-fail | idempotency | loop');
      process.exit(1);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('[Payment Simulator] Fatal error:', err.message);
  process.exit(1);
});
