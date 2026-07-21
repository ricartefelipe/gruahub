package com.gruahub.payments.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.payments.domain.PaymentProvider;
import com.gruahub.payments.domain.PaymentStatus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
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

@ApplicationScoped
public class SandboxPaymentProvider implements PaymentProvider {

    private static final Logger LOG = Logger.getLogger(SandboxPaymentProvider.class);

    @ConfigProperty(name = "gruahub.sandbox.secret", defaultValue = "")
    String sandboxSecret;

    @Inject
    ObjectMapper objectMapper;

    private final ConcurrentHashMap<String, PaymentStatus> statusStore = new ConcurrentHashMap<>();

    @Override
    public String providerName() {
        return "SANDBOX";
    }

    @Override
    public PaymentCreateResult createPayment(PaymentCreateRequest request) {
        String txId = "SANDBOX-" + UUID.randomUUID().toString().toUpperCase().replace("-", "").substring(0, 12);
        statusStore.put(txId, PaymentStatus.PENDING);
        LOG.infof("[SANDBOX] Created transaction %s for machine %s amount %d %s",
                txId, request.machineId(), request.amountCents(), request.currency());
        String copyPaste = "00020126580014BR.GOV.BCB.PIX0136" + txId;
        String metadata = "{\"sandbox\":true,\"copyPaste\":\"" + copyPaste + "\"}";
        return new PaymentCreateResult(txId, "PIX", null, copyPaste, null, metadata);
    }

    @Override
    public PaymentStatusResult checkStatus(String providerTransactionId) {
        PaymentStatus status = statusStore.getOrDefault(providerTransactionId, PaymentStatus.PENDING);
        return new PaymentStatusResult(providerTransactionId, status);
    }

    @Override
    public boolean verifyWebhookSignature(WebhookSignatureContext context) {
        if (context.signature() == null || context.signature().isBlank()) {
            LOG.warn("[SANDBOX] Webhook received without signature");
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec key = new SecretKeySpec(
                    sandboxSecret.getBytes(StandardCharsets.UTF_8),
                    "HmacSHA256");
            mac.init(key);
            byte[] expected = mac.doFinal(context.payload());
            String expectedHex = HexFormat.of().formatHex(expected);
            return MessageDigest.isEqual(
                    expectedHex.getBytes(StandardCharsets.UTF_8),
                    context.signature().getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            LOG.errorf("[SANDBOX] Signature verification error: %s", e.getMessage());
            return false;
        }
    }

    @Override
    public WebhookEvent parseWebhook(byte[] payload) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            String txId = node.path("transactionId").asText(null);
            String event = node.path("event").asText("PAYMENT_CONFIRMED");
            return new WebhookEvent(txId, event, false);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid sandbox webhook payload", e);
        }
    }

    public void sandboxCreate(String providerTransactionId) {
        statusStore.put(providerTransactionId, PaymentStatus.PENDING);
        LOG.infof("[SANDBOX] Transaction %s registered", providerTransactionId);
    }

    public void sandboxConfirm(String providerTransactionId) {
        statusStore.put(providerTransactionId, PaymentStatus.CONFIRMED);
        LOG.infof("[SANDBOX] Transaction %s confirmed via sandbox endpoint", providerTransactionId);
    }

    public void sandboxFail(String providerTransactionId) {
        statusStore.put(providerTransactionId, PaymentStatus.FAILED);
    }

    public String getSandboxSecret() {
        return sandboxSecret;
    }
}
