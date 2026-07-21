package com.gruahub.iot.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.gruahub.iot.domain.ControllerAdapter;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.Locale;

@ApplicationScoped
public class GenericMqttAdapter implements ControllerAdapter {

    @Override
    public String adapterKey() {
        return "GENERIC";
    }

    @Override
    public String buildGrantCreditCommand(GrantCreditCommand command) {
        return String.format("""
                {
                  "schemaVersion": 1,
                  "messageId": "%s",
                  "tenantId": "%s",
                  "machineId": "%s",
                  "type": "GRANT_CREDIT",
                  "occurredAt": "%s",
                  "payload": {
                    "commandId": "%s",
                    "creditGrantId": "%s",
                    "playsGranted": %d,
                    "amountCents": %d,
                    "ttlSeconds": %d
                  }
                }""",
                command.commandId(),
                command.tenantId(),
                command.machineId(),
                Instant.now(),
                command.commandId(),
                command.creditGrantId(),
                command.playsGranted(),
                command.amountCents(),
                command.ttlSeconds());
    }

    @Override
    public String buildRemoteCommand(RemoteCommand command) {
        return String.format("""
                {
                  "schemaVersion": 1,
                  "messageId": "%s",
                  "tenantId": "%s",
                  "machineId": "%s",
                  "type": "%s",
                  "occurredAt": "%s",
                  "payload": {
                    "commandId": "%s",
                    "commandType": "%s",
                    "ttlSeconds": %d
                  }
                }""",
                command.commandId(),
                command.tenantId(),
                command.machineId(),
                command.commandType(),
                Instant.now(),
                command.commandId(),
                command.commandType(),
                command.ttlSeconds());
    }

    @Override
    public NormalizedInbound normalizeInbound(String messageType, JsonNode envelope) {
        String normalized = messageType == null ? "" : messageType.trim().toUpperCase(Locale.ROOT);
        return new NormalizedInbound(normalized, envelope);
    }
}
