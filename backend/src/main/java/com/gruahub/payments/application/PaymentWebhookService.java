package com.gruahub.payments.application;

import com.gruahub.payments.domain.PaymentProvider;
import com.gruahub.payments.domain.PaymentStatus;
import com.gruahub.payments.infra.SandboxPaymentProvider;
import com.gruahub.fiscal.application.FiscalDocumentService;
import com.gruahub.plays.application.CreditService;
import com.gruahub.plays.application.PlayGrantCalculator;
import com.gruahub.promotions.application.CampaignBonusResolver;
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
    PaymentProviderRegistry providerRegistry;

    @Inject
    SandboxPaymentProvider sandboxProvider;

    @Inject
    CreditService creditService;

    @Inject
    CampaignBonusResolver campaignBonusResolver;

    @Inject
    FiscalDocumentService fiscalDocumentService;

    @Transactional
    public void processWebhook(String providerName, UUID tenantId, String idempotencyKey,
                               String signature, String requestId, String dataId, byte[] body) {

        PaymentProvider provider = providerRegistry.require(providerName);

        PaymentProvider.WebhookEvent event = provider.parseWebhook(body);
        if (event.providerTransactionId() == null || event.providerTransactionId().isBlank()) {
            LOG.debugf("Webhook ignored for provider=%s eventType=%s", providerName, event.eventType());
            return;
        }

        String effectiveDataId = (dataId != null && !dataId.isBlank())
                ? dataId
                : event.providerTransactionId();

        PaymentProvider.WebhookSignatureContext signatureContext =
                new PaymentProvider.WebhookSignatureContext(body, signature, requestId, effectiveDataId);
        if (!provider.verifyWebhookSignature(signatureContext)) {
            LOG.warnf("Webhook signature invalid for provider=%s tenant=%s", providerName, tenantId);
            throw new SecurityException("Invalid webhook signature");
        }

        String bodyHash = hashBody(body);
        String eventKey = (idempotencyKey != null && !idempotencyKey.isBlank())
                ? idempotencyKey
                : bodyHash;

        UUID resolvedTenantId = tenantId;
        if (resolvedTenantId == null) {
            resolvedTenantId = lookupTenantId(provider.providerName(), event.providerTransactionId());
            if (resolvedTenantId == null) {
                LOG.warnf("Webhook tenant unresolved provider=%s tx=%s",
                        providerName, event.providerTransactionId());
                throw new IllegalArgumentException("Unable to resolve tenant for payment webhook");
            }
        }

        int inboxRows = em.createNativeQuery(
                "INSERT INTO payment_event_inbox " +
                "(id, event_key, provider, tenant_id, event_type, payload_hash, status, received_at) " +
                "VALUES (:id, :key, :prov, :tid, :etype, :hash, 'RECEIVED', :now) " +
                "ON CONFLICT (event_key, tenant_id) DO NOTHING")
                .setParameter("id", UUID.randomUUID())
                .setParameter("key", eventKey)
                .setParameter("prov", provider.providerName())
                .setParameter("tid", resolvedTenantId)
                .setParameter("etype", event.eventType())
                .setParameter("hash", bodyHash)
                .setParameter("now", Instant.now())
                .executeUpdate();

        if (inboxRows == 0) {
            LOG.debugf("Duplicate payment webhook eventKey=%s tenant=%s — skipped",
                    eventKey, resolvedTenantId);
            return;
        }

        try {
            String effectiveEvent = event.eventType();
            String providerTxId = event.providerTransactionId();

            if (event.requiresStatusFetch()) {
                PaymentProvider.PaymentStatusResult statusResult = provider.checkStatus(providerTxId);
                if (statusResult.status() == PaymentStatus.CONFIRMED) {
                    effectiveEvent = "PAYMENT_CONFIRMED";
                } else if (statusResult.status() == PaymentStatus.FAILED) {
                    effectiveEvent = "PAYMENT_FAILED";
                } else {
                    effectiveEvent = "PAYMENT_PENDING";
                }
            }

            em.createNativeQuery(
                    "UPDATE payment_event_inbox SET event_type = :type " +
                    "WHERE event_key = :key AND tenant_id = :tid")
                    .setParameter("type", effectiveEvent)
                    .setParameter("key", eventKey)
                    .setParameter("tid", resolvedTenantId)
                    .executeUpdate();

            if ("PAYMENT_CONFIRMED".equals(effectiveEvent)) {
                processPaymentConfirmed(resolvedTenantId, providerTxId);
            } else if ("PAYMENT_FAILED".equals(effectiveEvent)) {
                markPaymentFailed(resolvedTenantId, providerTxId);
            }

            em.createNativeQuery(
                    "UPDATE payment_event_inbox SET status = 'PROCESSED', processed_at = :now " +
                    "WHERE event_key = :key AND tenant_id = :tid")
                    .setParameter("now", Instant.now())
                    .setParameter("key", eventKey)
                    .setParameter("tid", resolvedTenantId)
                    .executeUpdate();

        } catch (Exception e) {
            LOG.errorf("Webhook processing failed for eventKey=%s: %s", eventKey, e.getMessage());
            markInboxFailed(eventKey, resolvedTenantId, e.getMessage());
            throw new RuntimeException("Webhook processing failed", e);
        }
    }

    private void processPaymentConfirmed(UUID tenantId, String providerTxId) {
        int updated = em.createNativeQuery(
                "UPDATE payment_transaction SET status = 'CONFIRMED', confirmed_at = :now, " +
                "updated_at = :now " +
                "WHERE provider_transaction_id = :txId AND tenant_id = :tid AND status = 'PENDING'")
                .setParameter("now", Instant.now())
                .setParameter("txId", providerTxId)
                .setParameter("tid", tenantId)
                .executeUpdate();

        if (updated == 0) {
            LOG.infof("Payment update noop for providerTxId=%s tenant=%s — skipping credit",
                    providerTxId, tenantId);
            return;
        }

        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, machine_id, amount_cents FROM payment_transaction " +
                "WHERE provider_transaction_id = :txId AND tenant_id = :tid AND status = 'CONFIRMED'")
                .setParameter("txId", providerTxId)
                .setParameter("tid", tenantId)
                .getResultList();

        if (rows.isEmpty()) {
            LOG.errorf("Payment confirmed but not found after UPDATE: providerTxId=%s tenant=%s",
                    providerTxId, tenantId);
            return;
        }

        Object[] row = rows.get(0);
        UUID paymentId = UUID.fromString(row[0].toString());
        UUID machineId = UUID.fromString(row[1].toString());
        long amountCents = ((Number) row[2]).longValue();
        MachinePlayConfig machineConfig = getMachinePlayConfig(machineId, tenantId);
        int basePlays = PlayGrantCalculator.basePlays(amountCents, machineConfig.playPriceCents());
        int campaignExtra = campaignBonusResolver.extraPlaysForPayment(
                tenantId, machineId, basePlays, Instant.now());
        int plays = PlayGrantCalculator.playsForPayment(
                amountCents,
                machineConfig.playPriceCents(),
                machineConfig.bonusPlays(),
                campaignExtra);

        if (plays <= 0) {
            LOG.warnf(
                    "Payment confirmed but zero plays granted: providerTxId=%s payment=%s machine=%s amount=%d price=%d",
                    providerTxId, paymentId, machineId, amountCents, machineConfig.playPriceCents());
            return;
        }

        creditService.grantCreditForPayment(tenantId, machineId, paymentId, amountCents, plays);
        fiscalDocumentService.tryCreatePaymentReceiptDraft(tenantId, paymentId);

        LOG.infof(
                "Payment confirmed and credit enqueued: providerTxId=%s payment=%s machine=%s plays=%d (machineBonus=%d campaignExtra=%d)",
                providerTxId, paymentId, machineId, plays, machineConfig.bonusPlays(), campaignExtra);
    }

    private void markPaymentFailed(UUID tenantId, String providerTxId) {
        em.createNativeQuery(
                "UPDATE payment_transaction SET status = 'FAILED', updated_at = :now " +
                "WHERE provider_transaction_id = :txId AND tenant_id = :tid AND status = 'PENDING'")
                .setParameter("now", Instant.now())
                .setParameter("txId", providerTxId)
                .setParameter("tid", tenantId)
                .executeUpdate();
    }

    private UUID lookupTenantId(String provider, String providerTxId) {
        Object result = em.createNativeQuery(
                "SELECT tenant_id FROM payment_transaction " +
                "WHERE provider_transaction_id = :txId AND provider = :prov " +
                "ORDER BY created_at DESC LIMIT 1")
                .setParameter("txId", providerTxId)
                .setParameter("prov", provider)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        return result == null ? null : UUID.fromString(result.toString());
    }

    private record MachinePlayConfig(long playPriceCents, int bonusPlays) {}

    private MachinePlayConfig getMachinePlayConfig(UUID machineId, UUID tenantId) {
        @SuppressWarnings("unchecked")
        List<Object[]> result = em.createNativeQuery(
                "SELECT play_price_cents, COALESCE(bonus_plays, 0) FROM machine " +
                "WHERE id = :mid AND tenant_id = :tid")
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .getResultList();
        if (result.isEmpty()) {
            return new MachinePlayConfig(200L, 0);
        }
        Object[] row = result.get(0);
        return new MachinePlayConfig(
                ((Number) row[0]).longValue(),
                ((Number) row[1]).intValue());
    }

    @Transactional
    public void simulateSandboxConfirmation(String transactionId, UUID tenantId,
                                             UUID machineId) throws Exception {
        ensurePaymentTransactionExists(transactionId, tenantId, machineId);

        String payload = String.format(
                "{\"transactionId\":\"%s\",\"event\":\"PAYMENT_CONFIRMED\",\"sandbox\":true}",
                transactionId);
        byte[] body = payload.getBytes(StandardCharsets.UTF_8);

        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        javax.crypto.spec.SecretKeySpec key = new javax.crypto.spec.SecretKeySpec(
                sandboxProvider.getSandboxSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(key);
        String signature = HexFormat.of().formatHex(mac.doFinal(body));

        String idempotencyKey = "sandbox-" + transactionId;
        processWebhook("SANDBOX", tenantId, idempotencyKey, signature, null, null, body);
    }

    private void ensurePaymentTransactionExists(String transactionId, UUID tenantId, UUID machineId) {
        em.createNativeQuery(
                "INSERT INTO payment_transaction " +
                "(id, tenant_id, machine_id, provider_transaction_id, provider, " +
                " amount_cents, currency, payment_method, status, created_at, updated_at) " +
                "VALUES (gen_random_uuid(), :tid, :mid, :txId, 'SANDBOX', " +
                "200, 'BRL', 'SANDBOX_QR', 'PENDING', NOW(), NOW()) " +
                "ON CONFLICT (provider_transaction_id, provider, tenant_id) DO NOTHING")
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId != null ? machineId : UUID.fromString("00000000-0000-0000-0000-000000000000"))
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
