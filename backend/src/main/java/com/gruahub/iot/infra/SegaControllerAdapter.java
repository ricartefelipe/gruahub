package com.gruahub.iot.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.gruahub.iot.domain.ControllerAdapter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.Locale;
import java.util.Map;

@ApplicationScoped
public class SegaControllerAdapter implements ControllerAdapter {

    private static final Map<String, String> INBOUND_ALIASES = Map.of(
            "CREDIT_ACK", "CREDIT_RECEIVED",
            "COMMAND_RESULT", "COMMAND_ACK"
    );

    @Inject
    GenericMqttAdapter genericAdapter;

    @Inject
    ObjectMapper objectMapper;

    @Override
    public String adapterKey() {
        return "SEGA";
    }

    @Override
    public String buildGrantCreditCommand(GrantCreditCommand command) {
        try {
            JsonNode base = objectMapper.readTree(genericAdapter.buildGrantCreditCommand(command));
            ObjectNode root = (ObjectNode) base;
            ObjectNode payload = (ObjectNode) root.get("payload");
            ObjectNode vendor = payload.putObject("vendorExtension");
            vendor.put("protocol", "sega-mdc-v1");
            vendor.put("credits", command.playsGranted());
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build Sega GRANT_CREDIT payload", e);
        }
    }

    @Override
    public String buildRemoteCommand(RemoteCommand command) {
        try {
            JsonNode base = objectMapper.readTree(genericAdapter.buildRemoteCommand(command));
            ObjectNode root = (ObjectNode) base;
            ObjectNode payload = (ObjectNode) root.get("payload");
            ObjectNode vendor = payload.putObject("vendorExtension");
            vendor.put("protocol", "sega-mdc-v1");
            vendor.put("op", command.commandType().toLowerCase(Locale.ROOT));
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build Sega remote command payload", e);
        }
    }

    @Override
    public NormalizedInbound normalizeInbound(String messageType, JsonNode envelope) {
        String upper = messageType == null ? "" : messageType.trim().toUpperCase(Locale.ROOT);
        return new NormalizedInbound(INBOUND_ALIASES.getOrDefault(upper, upper), envelope);
    }
}
