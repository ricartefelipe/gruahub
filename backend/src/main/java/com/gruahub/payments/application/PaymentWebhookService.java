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

    @Transactional
    public void processWebhook(String provider, UUID tenantId, String idempotencyKey,
                                String signature, byte[] body) {
        // Verificar assinatura
        if (!sandboxProvider.verifyWebhookSignature(body, signature, null)) {
            throw new SecurityException("Invalid webhook signature");
        }

        // Idempotência: verificar se já processamos este evento
        String eventKey = idempotencyKey != null ? idempotencyKey : hashBody(body);

        @SuppressWarnings("unchecked")
        List<Object> existing = em.createNativeQuery(
                "SELECT 1 FROM payment_event_inbox WHERE event_key = :key AND tenant_id = :tid")
                .setParameter("key", eventKey)
                .setParameter("tid", tenantId)
                .getResultList();

        if (!existing.isEmpty()) {
            LOG.debugf("Duplicate payment webhook event %s — skipped", eventKey);
            return;
        }

        try {
            JsonNode payload = objectMapper.readTree(body);
            String providerTxId = payload.path("transactionId").asText();
            String eventType = payload.path("event").asText("PAYMENT_CONFIRMED");

            // Registrar no inbox
            em.createNativeQuery(
                    "INSERT INTO payment_event_inbox (id, event_key, provider, tenant_id, " +
                    "event_type, payload_hash, status, received_at) " +
                    "VALUES (:id, :key, :prov, :tid, :type, :hash, 'RECEIVED', :now)")
                    .setParameter("id", UUID.randomUUID())
                    .setParameter("key", eventKey)
                    .setParameter("prov", provider.toUpperCase())
                    .setParameter("tid", tenantId)
                    .setParameter("type", eventType)
                    .setParameter("hash", hashBody(body))
                    .setParameter("now", Instant.now())
                    .executeUpdate();

            if ("PAYMENT_CONFIRMED".equals(eventType)) {
                processPaymentConfirmed(tenantId, providerTxId, payload);
            }

        } catch (Exception e) {
            LOG.errorf("Failed to process payment webhook: %s", e.getMessage());
            throw new RuntimeException("Webhook processing failed", e);
        }
    }

    private void processPaymentConfirmed(UUID tenantId, String providerTxId, JsonNode payload) {
        // Buscar transação existente
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, machine_id, amount_cents FROM payment_transaction " +
                "WHERE provider_transaction_id = :txId AND tenant_id = :tid AND status = 'PENDING'")
                .setParameter("txId", providerTxId)
                .setParameter("tid", tenantId)
                .getResultList();

        if (rows.isEmpty()) {
            LOG.warnf("Payment transaction not found for provider_id=%s tenant=%s", providerTxId, tenantId);
            return;
        }

        Object[] row = rows.get(0);
        UUID paymentId = UUID.fromString(row[0].toString());
        UUID machineId = UUID.fromString(row[1].toString());
        long amountCents = ((Number) row[2]).longValue();

        // Confirmar pagamento
        em.createNativeQuery(
                "UPDATE payment_transaction SET status = 'CONFIRMED', confirmed_at = :now, " +
                "updated_at = :now WHERE id = :id AND tenant_id = :tid AND status = 'PENDING'")
                .setParameter("now", Instant.now())
                .setParameter("id", paymentId)
                .setParameter("tid", tenantId)
                .executeUpdate();

        // Calcular número de jogadas (preço da máquina)
        long playPriceCents = getPlayPriceCents(machineId, tenantId);
        int plays = playPriceCents > 0 ? (int) (amountCents / playPriceCents) : 1;

        // Criar e enviar crédito (garantia: UNIQUE constraint em payment_transaction_id)
        creditService.grantCreditForPayment(tenantId, machineId, paymentId, amountCents, plays);

        LOG.infof("Payment confirmed: txId=%s machine=%s plays=%d", paymentId, machineId, plays);
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

    /** Simula um webhook de confirmação sandbox para demonstração */
    @Transactional
    public void simulateSandboxConfirmation(String transactionId, UUID tenantId) throws Exception {
        String payload = String.format(
                "{\"transactionId\":\"%s\",\"event\":\"PAYMENT_CONFIRMED\",\"sandbox\":true}",
                transactionId);
        byte[] body = payload.getBytes(StandardCharsets.UTF_8);

        // Gerar assinatura sandbox
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        javax.crypto.spec.SecretKeySpec key = new javax.crypto.spec.SecretKeySpec(
                sandboxProvider.getSandboxSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(key);
        String signature = HexFormat.of().formatHex(mac.doFinal(body));

        processWebhook("SANDBOX", tenantId, UUID.randomUUID().toString(), signature, body);
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
