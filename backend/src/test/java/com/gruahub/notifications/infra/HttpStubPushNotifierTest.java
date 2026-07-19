package com.gruahub.notifications.infra;

import com.gruahub.notifications.domain.PushNotifier;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class HttpStubPushNotifierTest {

    @Test
    void buildPayloadEscapesQuotesAndIncludesFields() {
        UUID tenantId = UUID.fromString("11111111-0000-0000-0000-000000000001");
        UUID machineId = UUID.fromString("66666666-0000-0000-0000-000000000001");
        PushNotifier.PushMessage message = new PushNotifier.PushMessage(
                tenantId,
                machineId,
                "MACHINE_OFFLINE",
                "WARNING",
                "Titulo \"critico\"",
                "Sem heartbeat");

        String json = HttpStubPushNotifier.buildPayload(message);

        assertThat(json).contains("\"channel\":\"push-stub\"");
        assertThat(json).contains("\"provider\":\"http-stub\"");
        assertThat(json).contains("\"tenantId\":\"" + tenantId + "\"");
        assertThat(json).contains("\"machineId\":\"" + machineId + "\"");
        assertThat(json).contains("\"alertType\":\"MACHINE_OFFLINE\"");
        assertThat(json).contains("\"title\":\"Titulo \\\"critico\\\"\"");
        assertThat(json).contains("\"body\":\"Sem heartbeat\"");
    }

    @Test
    void buildPayloadAllowsNullIds() {
        PushNotifier.PushMessage message = new PushNotifier.PushMessage(
                null, null, "TEST", "INFO", "t", "b");

        String json = HttpStubPushNotifier.buildPayload(message);

        assertThat(json).contains("\"tenantId\":null");
        assertThat(json).contains("\"machineId\":null");
    }
}
