package com.gruahub.payments.domain;

import java.util.UUID;

public interface PaymentProvider {

    String providerName();

    PaymentCreateResult createPayment(PaymentCreateRequest request);

    PaymentStatusResult checkStatus(String providerTransactionId);

    boolean verifyWebhookSignature(WebhookSignatureContext context);

    WebhookEvent parseWebhook(byte[] payload);

    record PaymentCreateRequest(
            UUID paymentId,
            UUID machineId,
            UUID tenantId,
            long amountCents,
            String currency,
            String description
    ) {}

    record PaymentCreateResult(
            String providerTransactionId,
            String paymentMethod,
            String qrCodeBase64,
            String copyPaste,
            String ticketUrl,
            String metadataJson
    ) {}

    record PaymentStatusResult(String providerTransactionId, PaymentStatus status) {}

    record WebhookSignatureContext(
            byte[] payload,
            String signature,
            String requestId,
            String dataId
    ) {}

    record WebhookEvent(
            String providerTransactionId,
            String eventType,
            boolean requiresStatusFetch
    ) {}
}
