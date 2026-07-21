package com.gruahub.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.iot.domain.ControllerAdapter;
import com.gruahub.iot.infra.EletekControllerAdapter;
import com.gruahub.iot.infra.GenericMqttAdapter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EletekControllerAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private EletekControllerAdapter adapter;

    @BeforeEach
    void setUp() throws Exception {
        adapter = new EletekControllerAdapter();
        setField(adapter, "genericAdapter", new GenericMqttAdapter());
        setField(adapter, "objectMapper", objectMapper);
    }

    @Test
    void mapsVendorAliasesToCanonicalTypes() {
        ControllerAdapter.NormalizedInbound inbound =
                adapter.normalizeInbound("CREDIT_OK", objectMapper.createObjectNode());
        assertEquals("CREDIT_RECEIVED", inbound.messageType());

        ControllerAdapter.NormalizedInbound ack =
                adapter.normalizeInbound("CMD_ACK", objectMapper.createObjectNode());
        assertEquals("COMMAND_ACK", ack.messageType());
    }

    @Test
    void normalizesResultFieldIntoAckStatus() throws Exception {
        JsonNode envelope = objectMapper.readTree("""
                {
                  "type": "CMD_ACK",
                  "payload": {
                    "commandId": "cmd-1",
                    "result": "OK"
                  }
                }
                """);

        ControllerAdapter.NormalizedInbound inbound = adapter.normalizeInbound("CMD_ACK", envelope);
        assertEquals("COMMAND_ACK", inbound.messageType());
        assertEquals("EXECUTED", inbound.envelope().path("payload").path("status").asText());
        assertTrue(inbound.envelope().path("payload").path("success").asBoolean());
    }

    @Test
    void grantCreditIncludesEletekVendorExtension() throws Exception {
        UUID tenantId = UUID.randomUUID();
        UUID machineId = UUID.randomUUID();
        UUID creditId = UUID.randomUUID();

        String json = adapter.buildGrantCreditCommand(new ControllerAdapter.GrantCreditCommand(
                tenantId, machineId, "cmd-1", creditId, 3, 600, 300
        ));
        JsonNode root = objectMapper.readTree(json);

        assertEquals("GRANT_CREDIT", root.path("type").asText());
        assertEquals("eletek-pulse-v1", root.path("payload").path("vendorExtension").path("protocol").asText());
        assertEquals(3, root.path("payload").path("vendorExtension").path("pulseCount").asInt());
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
