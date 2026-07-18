package com.gruahub.payments.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.payments.infra.SandboxPaymentProvider;
import com.gruahub.plays.application.CreditService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Serviço de processamento de webhooks de pagamento.
 * <p>
 * Garantias:
 * - HMAC verificado antes de qualquer leitura de payload
 * - Inbox idempotente via INSERT ON CONFLICT DO NOTHING (resistente a TOCTOU)
 * - Confirmação de pagamento atômica: UPDATE WHERE status=PENDING + check rows affected
 * - Exatamente um CreditGrant por PaymentTransaction via unique constraint
 * - Crédito criado via outbox — nunca perdido se MQTT estiver indisponível
 */
@ApplicationScoped
public class PaymentWebhookService {

    private static final Logger LOG = Logger.getLogger(PaymentWebhookService.class);

    @Inject
    EntityManager em;

    @Inject
    SandboxPaymentProvider sandboxProvider;

    @Inject
    CreditService creditService;

    @Inject
    ObjectMapper objectMapper;

    /**
     * Processa um webhook de pagamento.
     *
     * @param provider         nome do provedor (SANDBOX, etc.)
     * @param tenantId         UUID do tenant (do header X-Tenant-Id — não do payload)
     * @param idempotencyKey   chave de idempotência do header
     * @param signature        assinatura HMAC-SHA256 do header X-Signature
     * @param body             bytes exatos do corpo da requisição
     * @throws SecurityException se a assinatura for inválida
     */
    @Transactional
    public void processWebhook(String provider, UUID tenantId, String idempotencyKey,
                                String signature, byte[] body) {

        // ── 1. Verificar HMAC antes de qualquer processamento ──────────────────
        // Comparação em tempo constante via MessageDigest.isEqual (já em SandboxPaymentProvider).
        // SecurityException sobe ao resource que retorna 401.
        if (!sandboxProvider.verifyWebhookSignature(body, signature, null)) {
            LOG.warnf("Webhook signature invalid for provider=%s tenant=%s", provider, tenantId);
            throw new SecurityException("Invalid webhook signature");
        }

        // ── 2. Chave de idempotência: header > hash do body ────────────────────
        String bodyHash = hashBody(body);
        String eventKey = (idempotencyKey != null && !idempotencyKey.isBlank())
                ? idempotencyKey
                : bodyHash;

        // ── 3. Inbox: INSERT ON CONFLICT DO NOTHING ────────────────────────────
        // unique constraint uq_payment_event_key_tenant (event_key, tenant_id).
        // Dois threads concorrentes com o mesmo eventKey: apenas um insere (rows=1),
        // o outro recebe rows=0 e retorna. Sem TOCTOU.
        int inboxRows = em.createNativeQuery(
                "INSERT INTO payment_event_inbox " +
                "(id, event_key, provider, tenant_id, event_type, payload_hash, status, received_at) " +
                "VALUES (:id, :key, :prov, :tid, 'PENDING_PARSE', :hash, 'RECEIVED', :now) " +
                "ON CONFLICT (event_key, tenant_id) DO NOTHING")
                .setParameter("id",   UUID.randomUUID())
                .setParameter("key",  eventKey)
                .setParameter("prov", provider.toUpperCase())
                .setParameter("tid",  tenantId)
                .setParameter("hash", bodyHash)
                .setParameter("now",  Instant.now())
                .executeUpdate();

        if (inboxRows == 0) {
            LOG.debugf("Duplicate payment webhook eventKey=%s tenant=%s — skipped (idempotent)", eventKey, tenantId);
            return;
        }

        // ── 4. Parsear payload ────────────────────────────────────────────────
        JsonNode payload;
        String providerTxId;
        String eventType;
        try {
            payload     = objectMapper.readTree(body);
            providerTxId = payload.path("transactionId").asText(null);
            eventType   = payload.path("event").asText("PAYMENT_CONFIRMED");
        } catch (Exception e) {
            LOG.errorf("Failed to parse payment webhook body for eventKey=%s: %s", eventKey, e.getMessage());
            markInboxFailed(eventKey, tenantId, "JSON parse failed: " + e.getMessage());
            return;
        }

        if (providerTxId == null || providerTxId.isBlank()) {
            LOG.warnf("Webhook missing transactionId for eventKey=%s tenant=%s", eventKey, tenantId);
            markInboxFailed(eventKey, tenantId, "Missing transactionId");
            return;
        }

        // ── 5. Atualizar inbox com tipo real ──────────────────────────────────
        em.createNativeQuery(
                "UPDATE payment_event_inbox SET event_type = :type WHERE event_key = :key AND tenant_id = :tid")
                .setParameter("type", eventType)
                .setParameter("key",  eventKey)
                .setParameter("tid",  tenantId)
                .executeUpdate();

        // ── 6. Processar por tipo de evento ──────────────────────────────────
        try {
            if ("PAYMENT_CONFIRMED".equals(eventType)) {
                processPaymentConfirmed(tenantId, providerTxId);
            } else {
                LOG.debugf("Webhook event type '%s' not handled for eventKey=%s", eventType, eventKey);
            }

            // Marcar inbox como processado
            em.createNativeQuery(
                    "UPDATE payment_event_inbox SET status = 'PROCESSED', processed_at = :now " +
                    "WHERE event_key = :key AND tenant_id = :tid")
                    .setParameter("now", Instant.now())
                    .setParameter("key", eventKey)
                    .setParameter("tid", tenantId)
                    .executeUpdate();

        } catch (Exception e) {
            LOG.errorf("Webhook processing failed for eventKey=%s: %s", eventKey, e.getMessage());
            markInboxFailed(eventKey, tenantId, e.getMessage());
            throw new RuntimeException("Webhook processing failed", e);
        }
    }

    /**
     * Confirma um pagamento e cria o crédito de forma atômica.
     * <p>
     * Sequência:
     * 1. UPDATE payment WHERE status=PENDING → verifica rows affected (evita double-confirm)
     * 2. INSERT credit_grant ON CONFLICT DO NOTHING (unique em payment_transaction_id)
     * 3. Enfileira GRANT_CREDIT no outbox (não publica MQTT diretamente)
     * <p>
     * Se dois webhooks idênticos chegarem concorrentes:
     * - O inbox (passo anterior) garante que apenas um processa
     * - Mas se a chave de idempotência for diferente (raro), o UPDATE WHERE status=PENDING
     *   garante que apenas o primeiro confirma; o segundo vê 0 rows e para.
     */
    private void processPaymentConfirmed(UUID tenantId, String providerTxId) {
        // ── UPDATE atômico: apenas PENDING pode ser confirmado ─────────────────
        int updated = em.createNativeQuery(
                "UPDATE payment_transaction SET status = 'CONFIRMED', confirmed_at = :now, " +
                "updated_at = :now " +
                "WHERE provider_transaction_id = :txId AND tenant_id = :tid AND status = 'PENDING'")
                .setParameter("now",  Instant.now())
                .setParameter("txId", providerTxId)
                .setParameter("tid",  tenantId)
                .executeUpdate();

        if (updated == 0) {
            // Pode ser: transação não encontrada, já confirmada, ou cancelada.
            // Em todos os casos não cria novo crédito.
            LOG.infof("Payment update noop for providerTxId=%s tenant=%s "
                    + "(not found, already confirmed, or not PENDING) — skipping credit",
                    providerTxId, tenantId);
            return;
        }

        // ── Buscar dados da transação confirmada ────────────────────────────────
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, machine_id, amount_cents FROM payment_transaction " +
                "WHERE provider_transaction_id = :txId AND tenant_id = :tid AND status = 'CONFIRMED'")
                .setParameter("txId", providerTxId)
                .setParameter("tid",  tenantId)
                .getResultList();

        if (rows.isEmpty()) {
            LOG.errorf("Payment confirmed but not found after UPDATE: providerTxId=%s tenant=%s",
                    providerTxId, tenantId);
            return;
        }

        Object[] row          = rows.get(0);
        UUID paymentId        = UUID.fromString(row[0].toString());
        UUID machineId        = UUID.fromString(row[1].toString());
        long amountCents      = ((Number) row[2]).longValue();
        long playPriceCents   = getPlayPriceCents(machineId, tenantId);
        int plays             = playPriceCents > 0 ? (int) (amountCents / playPriceCents) : 1;

        // ── Criar crédito (exactly-once via unique constraint) ─────────────────
        creditService.grantCreditForPayment(tenantId, machineId, paymentId, amountCents, plays);

        LOG.infof("Payment confirmed and credit enqueued: providerTxId=%s payment=%s machine=%s plays=%d",
                providerTxId, paymentId, machineId, plays);
    }

    private long getPlayPriceCents(UUID machineId, UUID tenantId) {
        @SuppressWarnings("unchecked")
        List<Object> result = em.createNativeQuery(
                "SELECT play_price_cents FROM machine WHERE id = :mid AND tenant_id = :tid")
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .getResultList();
        return result.isEmpty() ? 200L : ((Number) result.get(0)).longValue();
    }

    /**
     * Simula um webhook de confirmação sandbox.
     * Cria automaticamente a payment_transaction se não existir (para facilitar demos).
     */
    @Transactional
    public void simulateSandboxConfirmation(String transactionId, UUID tenantId,
                                             UUID machineId) throws Exception {
        // Garantir que a payment_transaction existe (criada pelo fluxo de pagamento real
        // ou gerada aqui para sandbox)
        ensurePaymentTransactionExists(transactionId, tenantId, machineId);

        String payload = String.format(
                "{\"transactionId\":\"%s\",\"event\":\"PAYMENT_CONFIRMED\",\"sandbox\":true}",
                transactionId);
        byte[] body = payload.getBytes(StandardCharsets.UTF_8);

        // Gerar assinatura sandbox válida
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        javax.crypto.spec.SecretKeySpec key = new javax.crypto.spec.SecretKeySpec(
                sandboxProvider.getSandboxSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(key);
        String signature = HexFormat.of().formatHex(mac.doFinal(body));

        String idempotencyKey = "sandbox-" + transactionId;
        processWebhook("SANDBOX", tenantId, idempotencyKey, signature, body);
    }

    /**
     * Garante que uma payment_transaction existe no banco para o transactionId fornecido.
     * Usado pelo sandbox para criar transações fictícias.
     */
    private void ensurePaymentTransactionExists(String transactionId, UUID tenantId, UUID machineId) {
        em.createNativeQuery(
                "INSERT INTO payment_transaction " +
                "(id, tenant_id, machine_id, provider_transaction_id, provider, " +
                " amount_cents, currency, payment_method, status, created_at, updated_at) " +
                "VALUES (gen_random_uuid(), :tid, :mid, :txId, 'SANDBOX', " +
                "200, 'BRL', 'SANDBOX_QR', 'PENDING', NOW(), NOW()) " +
                "ON CONFLICT (provider_transaction_id, provider, tenant_id) DO NOTHING")
                .setParameter("tid",  tenantId)
                .setParameter("mid",  machineId != null ? machineId : UUID.fromString("00000000-0000-0000-0000-000000000000"))
                .setParameter("txId", transactionId)
                .executeUpdate();
    }

    private void markInboxFailed(String eventKey, UUID tenantId, String error) {
        em.createNativeQuery(
                "UPDATE payment_event_inbox SET status = 'FAILED', error_message = :err, " +
                "processed_at = :now WHERE event_key = :key AND tenant_id = :tid")
                .setParameter("err", error != null ? error.substring(0, Math.min(error.length(), 500)) : "unknown")
                .setParameter("now", Instant.now())
                .setParameter("key", eventKey)
                .setParameter("tid", tenantId)
                .executeUpdate();
    }

    private String hashBody(byte[] body) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(body));
        } catch (NoSuchAlgorithmException e) {
            return UUID.randomUUID().toString();
        }
    }
}
