package com.gruahub.iot.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.iot.application.IotEventService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Tenant efetivo vem do tópico MQTT (ACL EMQX), nunca do JSON payload. */
@ApplicationScoped
public class MqttMessageProcessor {

    private static final Logger LOG = Logger.getLogger(MqttMessageProcessor.class);

    /** Schema versions aceitas — adicionar novas explicitamente. */
    private static final Set<Integer> SUPPORTED_SCHEMA_VERSIONS = Set.of(1);

    private static final int MAX_PAYLOAD_BYTES = 64 * 1024;

    private static final Pattern TOPIC_PATTERN =
            Pattern.compile("^v1/([\\w-]+)/machines/([\\w-]+)/(\\w[\\w-]*)$");

    @Inject
    IotEventService iotEventService;

    @Inject
    ObjectMapper objectMapper;

    public void process(String topic, String payloadJson) {

        if (payloadJson != null && payloadJson.length() > MAX_PAYLOAD_BYTES) {
            LOG.warnf("MQTT payload too large on topic %s: %d bytes (max %d) — rejected",
                    topic, payloadJson.length(), MAX_PAYLOAD_BYTES);
            return;
        }

        Matcher m = TOPIC_PATTERN.matcher(topic);
        if (!m.matches()) {
            LOG.warnf("Unknown MQTT topic format rejected: %s", topic);
            return;
        }

        String tenantIdStr  = m.group(1);
        String machineIdStr = m.group(2);
        String topicType    = m.group(3);

        JsonNode payload;
        try {
            payload = objectMapper.readTree(payloadJson);
        } catch (Exception e) {
            LOG.warnf("Invalid JSON on topic %s — rejected [parseError=%s]",
                    topic, e.getClass().getSimpleName());
            return;
        }

        if (!payload.has("messageId") || payload.get("messageId").isNull()
                || payload.get("messageId").asText().isBlank()) {
            LOG.warnf("MQTT envelope missing messageId on topic %s — rejected", topic);
            return;
        }
        if (!payload.has("type") || payload.get("type").isNull()) {
            LOG.warnf("MQTT envelope missing type on topic %s — rejected", topic);
            return;
        }
        if (!payload.has("occurredAt") || payload.get("occurredAt").isNull()) {
            LOG.warnf("MQTT envelope missing occurredAt on topic %s — rejected", topic);
            return;
        }

        int schemaVersion = payload.has("schemaVersion")
                ? payload.get("schemaVersion").asInt(0) : 0;

        if (!SUPPORTED_SCHEMA_VERSIONS.contains(schemaVersion)) {
            LOG.warnf(
                "MQTT message rejected: unsupported schemaVersion=%d on topic %s "
                + "[messageId=%s supported=%s]",
                schemaVersion, topic,
                payload.get("messageId").asText(),
                SUPPORTED_SCHEMA_VERSIONS);
            return;
        }

        String messageId   = payload.get("messageId").asText();
        String messageType = payload.get("type").asText();

        // Não é obrigatório que coincidam exatamente, mas logamos divergências.
        if (!topicType.equalsIgnoreCase(messageType)
                && !isExpectedTopicForType(topicType, messageType)) {
            LOG.debugf("Topic suffix '%s' differs from message type '%s' on topic %s [messageId=%s]",
                    topicType, messageType, topic, messageId);
        }

        iotEventService.handleIncomingMessage(
                tenantIdStr, machineIdStr, messageId, messageType,
                schemaVersion, payloadJson, payload);
    }

    private boolean isExpectedTopicForType(String topicSuffix, String messageType) {
        return switch (topicSuffix) {
            case "telemetry" -> messageType.equals("HEARTBEAT") || messageType.equals("STATUS_REPORT");
            case "events"    -> messageType.equals("PLAY_STARTED") || messageType.equals("PLAY_COMPLETED")
                                || messageType.equals("ERROR_REPORT");
            case "command-acks" -> messageType.equals("COMMAND_ACK") || messageType.equals("CREDIT_RECEIVED");
            case "status"    -> messageType.equals("STATUS_REPORT") || messageType.equals("HEARTBEAT");
            default          -> false;
        };
    }
}
