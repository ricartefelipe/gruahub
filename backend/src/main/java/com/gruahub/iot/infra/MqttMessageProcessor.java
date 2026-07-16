package com.gruahub.iot.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.iot.application.IotEventService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Roteia mensagens MQTT para o serviço de domínio correto.
 * Extrai tenantId e machineId do tópico.
 */
@ApplicationScoped
public class MqttMessageProcessor {

    private static final Logger LOG = Logger.getLogger(MqttMessageProcessor.class);

    // v1/{tenantId}/machines/{machineId}/{type}
    private static final Pattern TOPIC_PATTERN =
            Pattern.compile("^v1/([\\w-]+)/machines/([\\w-]+)/(\\w+)$");

    @Inject
    IotEventService iotEventService;

    @Inject
    ObjectMapper objectMapper;

    public void process(String topic, String payloadJson) {
        Matcher m = TOPIC_PATTERN.matcher(topic);
        if (!m.matches()) {
            LOG.warnf("Unknown MQTT topic format: %s", topic);
            return;
        }

        String tenantIdStr = m.group(1);
        String machineIdStr = m.group(2);
        String topicType = m.group(3);

        try {
            JsonNode payload = objectMapper.readTree(payloadJson);

            // Validação básica de envelope
            if (!payload.has("messageId") || !payload.has("type")) {
                LOG.warnf("Invalid MQTT envelope on topic %s — missing messageId or type", topic);
                return;
            }

            String messageId = payload.get("messageId").asText();
            String messageType = payload.get("type").asText();

            iotEventService.handleIncomingMessage(
                    tenantIdStr, machineIdStr, messageId, messageType, payloadJson, payload);

        } catch (Exception e) {
            LOG.errorf("Failed to parse MQTT payload on %s: %s", topic, e.getMessage());
        }
    }
}
