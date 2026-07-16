package com.gruahub.payments.domain;

import java.util.UUID;

/**
 * Porta para provedores de pagamento.
 * Implementações: SandboxPaymentProvider, MercadoPagoPaymentProvider (futuro), etc.
 * O tenant nunca passa o provedor pelo corpo da requisição.
 */
public interface PaymentProvider {

    String providerName();

    /**
     * Cria uma transação de pagamento no provedor.
     * @return ID da transação no provedor
     */
    String createTransaction(PaymentCreateRequest request);

    /**
     * Verifica o status de uma transação existente.
     */
    PaymentStatusResult checkStatus(String providerTransactionId);

    /**
     * Verifica a assinatura de um evento de webhook.
     * @return true se a assinatura é válida
     */
    boolean verifyWebhookSignature(byte[] payload, String signature, String secret);

    record PaymentCreateRequest(
            UUID machineId,
            UUID tenantId,
            long amountCents,
            String currency,
            String description
    ) {}

    record PaymentStatusResult(String providerTransactionId, PaymentStatus status) {}
}
