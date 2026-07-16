package com.gruahub.payments.infra;

import com.gruahub.payments.domain.PaymentProvider;
import com.gruahub.payments.domain.PaymentStatus;
import jakarta.enterprise.context.ApplicationScoped;
import org.jboss.logging.Logger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SandboxPaymentProvider — implementação demonstrativa sem integração real.
 * Claramente identificado como sandbox em todos os logs e respostas.
 *
 * NUNCA usar em produção com dinheiro real.
 */
@ApplicationScoped
public class SandboxPaymentProvider implements PaymentProvider {

    private static final Logger LOG = Logger.getLogger(SandboxPaymentProvider.class);
    private static final String SANDBOX_WEBHOOK_SECRET = "sandbox-webhook-secret-gruahub-demo";

    // Estado em memória apenas para o sandbox — em produção o estado vem do provedor real
    private final ConcurrentHashMap<String, PaymentStatus> statusStore = new ConcurrentHashMap<>();

    @Override
    public String providerName() {
        return "SANDBOX";
    }

    @Override
    public String createTransaction(PaymentCreateRequest request) {
        String txId = "SANDBOX-" + UUID.randomUUID().toString().toUpperCase().replace("-", "").substring(0, 12);
        statusStore.put(txId, PaymentStatus.PENDING);
        LOG.infof("[SANDBOX] Created transaction %s for machine %s amount %d %s",
                txId, request.machineId(), request.amountCents(), request.currency());
        return txId;
    }

    @Override
    public PaymentStatusResult checkStatus(String providerTransactionId) {
        PaymentStatus status = statusStore.getOrDefault(providerTransactionId, PaymentStatus.PENDING);
        return new PaymentStatusResult(providerTransactionId, status);
    }

    @Override
    public boolean verifyWebhookSignature(byte[] payload, String signature, String secret) {
        if (signature == null || signature.isBlank()) {
            LOG.warn("[SANDBOX] Webhook received without signature");
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec key = new SecretKeySpec(
                    (secret != null ? secret : SANDBOX_WEBHOOK_SECRET).getBytes(StandardCharsets.UTF_8),
                    "HmacSHA256");
            mac.init(key);
            byte[] expected = mac.doFinal(payload);
            String expectedHex = HexFormat.of().formatHex(expected);

            // Constant-time comparison
            return MessageDigest.isEqual(
                    expectedHex.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            LOG.errorf("[SANDBOX] Signature verification error: %s", e.getMessage());
            return false;
        }
    }

    /** Utilitário sandbox: confirma uma transação pendente (não existe em produção) */
    public void sandboxConfirm(String providerTransactionId) {
        statusStore.put(providerTransactionId, PaymentStatus.CONFIRMED);
        LOG.infof("[SANDBOX] Transaction %s confirmed via sandbox endpoint", providerTransactionId);
    }

    /** Utilitário sandbox: falha uma transação */
    public void sandboxFail(String providerTransactionId) {
        statusStore.put(providerTransactionId, PaymentStatus.FAILED);
    }

    public String getSandboxSecret() {
        return SANDBOX_WEBHOOK_SECRET;
    }
}
