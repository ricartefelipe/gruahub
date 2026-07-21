package com.gruahub.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.payments.domain.PaymentProvider;
import com.gruahub.payments.infra.MercadoPagoPaymentProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MercadoPagoSignatureTest {

    private MercadoPagoPaymentProvider provider;

    @BeforeEach
    void setUp() throws Exception {
        provider = new MercadoPagoPaymentProvider();
        setField(provider, "webhookSecret", java.util.Optional.of("test-secret"));
        setField(provider, "objectMapper", new ObjectMapper());
    }

    @Test
    void acceptsValidManifestSignature() throws Exception {
        String dataId = "123456";
        String requestId = "req-abc";
        String ts = "1742505638683";
        String manifest = "id:" + dataId + ";request-id:" + requestId + ";ts:" + ts + ";";
        String v1 = hmacHex("test-secret", manifest);
        String signature = "ts=" + ts + ",v1=" + v1;

        boolean ok = provider.verifyWebhookSignature(
                new PaymentProvider.WebhookSignatureContext(
                        "{}".getBytes(StandardCharsets.UTF_8),
                        signature,
                        requestId,
                        dataId
                )
        );
        assertTrue(ok);
    }

    @Test
    void rejectsInvalidSignature() {
        boolean ok = provider.verifyWebhookSignature(
                new PaymentProvider.WebhookSignatureContext(
                        "{}".getBytes(StandardCharsets.UTF_8),
                        "ts=1,v1=deadbeef",
                        "req",
                        "123"
                )
        );
        assertFalse(ok);
    }

    private static String hmacHex(String secret, String manifest) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)));
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
