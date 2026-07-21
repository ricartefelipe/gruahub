package com.gruahub.payments.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gruahub.payments.domain.PaymentProvider;
import com.gruahub.payments.domain.PaymentStatus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;

@ApplicationScoped
public class MercadoPagoPaymentProvider implements PaymentProvider {

    private static final Logger LOG = Logger.getLogger(MercadoPagoPaymentProvider.class);
    private static final String API_BASE = "https://api.mercadopago.com";

    @ConfigProperty(name = "gruahub.payment.mercadopago.access-token", defaultValue = "")
    String accessToken;

    @ConfigProperty(name = "gruahub.payment.mercadopago.webhook-secret", defaultValue = "")
    String webhookSecret;

    @ConfigProperty(name = "gruahub.payment.mercadopago.notification-url", defaultValue = "")
    Optional<String> notificationUrl;

    @ConfigProperty(name = "gruahub.payment.mercadopago.payer-email", defaultValue = "pagamentos@gruahub.local")
    String payerEmail;

    @Inject
    ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public String providerName() {
        return "MERCADOPAGO";
    }

    @Override
    public PaymentCreateResult createPayment(PaymentCreateRequest request) {
        requireAccessToken();
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("transaction_amount", request.amountCents() / 100.0);
            body.put("description", request.description() != null
                    ? request.description()
                    : "Jogada GruaHub");
            body.put("payment_method_id", "pix");
            body.put("external_reference", request.paymentId().toString());
            ObjectNode payer = body.putObject("payer");
            payer.put("email", payerEmail);
            notificationUrl.filter(u -> !u.isBlank()).ifPresent(url -> body.put("notification_url", url));

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(API_BASE + "/v1/payments"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .header("X-Idempotency-Key", request.paymentId().toString())
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                LOG.errorf("[MP] create payment failed status=%d body=%s",
                        response.statusCode(), truncate(response.body()));
                throw new IllegalStateException("Mercado Pago create payment failed: HTTP " + response.statusCode());
            }

            JsonNode json = objectMapper.readTree(response.body());
            String providerTxId = json.path("id").asText(null);
            if (providerTxId == null || providerTxId.isBlank()) {
                throw new IllegalStateException("Mercado Pago response missing payment id");
            }

            JsonNode txData = json.path("point_of_interaction").path("transaction_data");
            String qrCodeBase64 = textOrNull(txData, "qr_code_base64");
            String copyPaste = textOrNull(txData, "qr_code");
            String ticketUrl = textOrNull(txData, "ticket_url");

            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("provider", "MERCADOPAGO");
            metadata.put("status", json.path("status").asText());
            if (copyPaste != null) metadata.put("copyPaste", copyPaste);
            if (ticketUrl != null) metadata.put("ticketUrl", ticketUrl);

            return new PaymentCreateResult(
                    providerTxId,
                    "PIX",
                    qrCodeBase64,
                    copyPaste,
                    ticketUrl,
                    objectMapper.writeValueAsString(metadata)
            );
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Mercado Pago create payment error: " + e.getMessage(), e);
        }
    }

    @Override
    public PaymentStatusResult checkStatus(String providerTransactionId) {
        requireAccessToken();
        try {
            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(API_BASE + "/v1/payments/" + providerTransactionId))
                    .timeout(Duration.ofSeconds(15))
                    .header("Authorization", "Bearer " + accessToken)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Mercado Pago status failed: HTTP " + response.statusCode());
            }
            JsonNode json = objectMapper.readTree(response.body());
            String mpStatus = json.path("status").asText("pending");
            PaymentStatus status = switch (mpStatus) {
                case "approved" -> PaymentStatus.CONFIRMED;
                case "rejected", "cancelled", "refunded", "charged_back" -> PaymentStatus.FAILED;
                default -> PaymentStatus.PENDING;
            };
            return new PaymentStatusResult(providerTransactionId, status);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Mercado Pago status error: " + e.getMessage(), e);
        }
    }

    @Override
    public boolean verifyWebhookSignature(WebhookSignatureContext context) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            LOG.warn("[MP] Webhook secret not configured");
            return false;
        }
        if (context.signature() == null || context.signature().isBlank()) {
            return false;
        }
        try {
            String ts = null;
            String v1 = null;
            for (String part : context.signature().split(",")) {
                String[] kv = part.trim().split("=", 2);
                if (kv.length != 2) continue;
                if ("ts".equals(kv[0])) ts = kv[1];
                if ("v1".equals(kv[0])) v1 = kv[1];
            }
            if (ts == null || v1 == null) {
                return false;
            }

            StringBuilder manifest = new StringBuilder();
            if (context.dataId() != null && !context.dataId().isBlank()) {
                manifest.append("id:").append(context.dataId().toLowerCase(Locale.ROOT)).append(";");
            }
            if (context.requestId() != null && !context.requestId().isBlank()) {
                manifest.append("request-id:").append(context.requestId()).append(";");
            }
            manifest.append("ts:").append(ts).append(";");

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String expected = HexFormat.of().formatHex(mac.doFinal(manifest.toString().getBytes(StandardCharsets.UTF_8)));
            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    v1.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            LOG.errorf("[MP] Signature verification error: %s", e.getMessage());
            return false;
        }
    }

    @Override
    public WebhookEvent parseWebhook(byte[] payload) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            String dataId = node.path("data").path("id").asText(null);
            if (dataId == null || dataId.isBlank()) {
                dataId = node.path("id").asText(null);
            }
            String action = node.path("action").asText("");
            String type = node.path("type").asText("");
            boolean paymentRelated = action.startsWith("payment.") || "payment".equals(type)
                    || (dataId != null && !dataId.isBlank());
            if (!paymentRelated || dataId == null || dataId.isBlank()) {
                return new WebhookEvent(null, "IGNORED", false);
            }
            return new WebhookEvent(dataId, "PAYMENT_STATUS_CHECK", true);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid Mercado Pago webhook payload", e);
        }
    }

    private void requireAccessToken() {
        if (accessToken == null || accessToken.isBlank()) {
            throw new IllegalStateException("Mercado Pago access token not configured");
        }
    }

    private static String textOrNull(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }

    private static String truncate(String value) {
        if (value == null) return "";
        return value.length() <= 500 ? value : value.substring(0, 500);
    }
}
