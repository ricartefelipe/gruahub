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

/**
 * Roteia mensagens MQTT para o serviço de domínio correto.
 * <p>
 * Responsabilidades:
 * - Extrair tenantId e machineId do tópico (fonte autoritativa de identidade)
 * - Validar envelope canônico (schemaVersion, messageId, type, occurredAt)
 * - Rejeitar versões desconhecidas
 * - Limitar tamanho de payload
 * - Auditar erros sem logar payload completo
 * <p>
 * O tenant efetivo NUNCA vem do JSON — sempre do tópico, que é validado pela
 * ACL do EMQX com base nas credenciais do dispositivo.
 */
@ApplicationScoped
public class MqttMessageProcessor {

    private static final Logger LOG = Logger.getLogger(MqttMessageProcessor.class);

    /** Versões de schema aceitas. Novas versões devem ser adicionadas aqui explicitamente. */
    private static final Set<Integer> SUPPORTED_SCHEMA_VERSIONS = Set.of(1);

    /** Tamanho máximo de payload em bytes (64 KB). */
    private static final int MAX_PAYLOAD_BYTES = 64 * 1024;

    /** Padrão canônico de tópico: v1/{tenantId}/machines/{machineId}/{type} */
    private static final Pattern TOPIC_PATTERN =
            Pattern.compile("^v1/([\\w-]+)/machines/([\\w-]+)/(\\w[\\w-]*)$");

    @Inject
    IotEventService iotEventService;

    @Inject
    ObjectMapper objectMapper;

    /**
     * Processa uma mensagem MQTT recebida.
     *
     * @param topic      tópico MQTT completo
     * @param payloadJson payload como string (tamanho já verificado pelo broker)
     */
    public void process(String topic, String payloadJson) {

        // ── 1. Limite de tamanho ────────────────────────────────────────────────
        if (payloadJson != null && payloadJson.length() > MAX_PAYLOAD_BYTES) {
            LOG.warnf("MQTT payload too large on topic %s: %d bytes (max %d) — rejected",
                    topic, payloadJson.length(), MAX_PAYLOAD_BYTES);
            return;
        }

        // ── 2. Parsear tópico ───────────────────────────────────────────────────
        Matcher m = TOPIC_PATTERN.matcher(topic);
        if (!m.matches()) {
            LOG.warnf("Unknown MQTT topic format rejected: %s", topic);
            return;
        }

        String tenantIdStr  = m.group(1);
        String machineIdStr = m.group(2);
        String topicType    = m.group(3);

        // ── 3. Parsear JSON sem logar payload ──────────────────────────────────
        JsonNode payload;
        try {
            payload = objectMapper.readTree(payloadJson);
        } catch (Exception e) {
            LOG.warnf("Invalid JSON on topic %s — rejected [parseError=%s]",
                    topic, e.getClass().getSimpleName());
            return;
        }

        // ── 4. Validar campos obrigatórios do envelope ─────────────────────────
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

        // ── 5. Validar schemaVersion — não aceitar versão desconhecida ─────────
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

        // ── 6. Verificar coerência entre tipo do tópico e tipo da mensagem ─────
        // Não é obrigatório que coincidam exatamente, mas logamos divergências.
        if (!topicType.equalsIgnoreCase(messageType)
                && !isExpectedTopicForType(topicType, messageType)) {
            LOG.debugf("Topic suffix '%s' differs from message type '%s' on topic %s [messageId=%s]",
                    topicType, messageType, topic, messageId);
        }

        // ── 7. Despachar para o serviço de domínio ─────────────────────────────
        iotEventService.handleIncomingMessage(
                tenantIdStr, machineIdStr, messageId, messageType,
                schemaVersion, payloadJson, payload);
    }

    /**
     * Relação esperada entre sufixo do tópico e tipo de mensagem.
     * Permite que telemetria publique heartbeats, events publique play events, etc.
     */
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
