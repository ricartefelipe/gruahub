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
public class EletekControllerAdapter implements ControllerAdapter {

    private static final Map<String, String> INBOUND_ALIASES = Map.of(
            "CREDIT_OK", "CREDIT_RECEIVED",
            "ACK", "COMMAND_ACK",
            "CMD_ACK", "COMMAND_ACK",
            "PULSE_DONE", "CREDIT_RECEIVED"
    );

    @Inject
    GenericMqttAdapter genericAdapter;

    @Inject
    ObjectMapper objectMapper;

    @Override
    public String adapterKey() {
        return "ELETEK";
    }

    @Override
    public String buildGrantCreditCommand(GrantCreditCommand command) {
        try {
            JsonNode base = objectMapper.readTree(genericAdapter.buildGrantCreditCommand(command));
            ObjectNode root = (ObjectNode) base;
            ObjectNode payload = (ObjectNode) root.get("payload");
            ObjectNode vendor = payload.putObject("vendorExtension");
            vendor.put("protocol", "eletek-pulse-v1");
            vendor.put("pulseCount", command.playsGranted());
            vendor.put("channel", 1);
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build Eletek GRANT_CREDIT payload", e);
        }
    }

    @Override
    public String buildRemoteCommand(RemoteCommand command) {
        try {
            JsonNode base = objectMapper.readTree(genericAdapter.buildRemoteCommand(command));
            ObjectNode root = (ObjectNode) base;
            ObjectNode payload = (ObjectNode) root.get("payload");
            ObjectNode vendor = payload.putObject("vendorExtension");
            vendor.put("protocol", "eletek-control-v1");
            if ("REBOOT".equals(command.commandType())) {
                vendor.put("restartMode", "soft");
            }
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to build Eletek remote command payload", e);
        }
    }

    @Override
    public NormalizedInbound normalizeInbound(String messageType, JsonNode envelope) {
        String upper = messageType == null ? "" : messageType.trim().toUpperCase(Locale.ROOT);
        String canonical = INBOUND_ALIASES.getOrDefault(upper, upper);

        if (envelope != null && envelope.has("payload")) {
            JsonNode payload = envelope.get("payload");
            if (payload.has("result") && !payload.has("status")
                    && ("COMMAND_ACK".equals(canonical) || "CREDIT_RECEIVED".equals(canonical))) {
                try {
                    ObjectNode copy = envelope.deepCopy();
                    ObjectNode payloadCopy = (ObjectNode) copy.get("payload");
                    String result = payload.path("result").asText("");
                    if ("OK".equalsIgnoreCase(result) || "SUCCESS".equalsIgnoreCase(result)) {
                        payloadCopy.put("status", "EXECUTED");
                        payloadCopy.put("success", true);
                    } else if (!result.isBlank()) {
                        payloadCopy.put("status", "FAILED");
                        payloadCopy.put("success", false);
                        payloadCopy.put("failureReason", result);
                    }
                    return new NormalizedInbound(canonical, copy);
                } catch (Exception ignored) {
                    return new NormalizedInbound(canonical, envelope);
                }
            }
        }

        return new NormalizedInbound(canonical, envelope);
    }
}
