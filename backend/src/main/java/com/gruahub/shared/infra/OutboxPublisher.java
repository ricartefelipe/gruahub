package com.gruahub.shared.infra;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.iot.infra.MqttClientService;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Outbox transacional: publica eventos pendentes via MQTT.
 * <p>
 * Padrão outbox garante que o comando MQTT nunca é enviado dentro
 * da transação de negócio — eliminando o risco de mensagem enviada
 * sem commit ou commit sem mensagem.
 * <p>
 * O scheduler usa FOR UPDATE SKIP LOCKED para concorrência segura.
 */
@ApplicationScoped
public class OutboxPublisher {

    private static final Logger LOG = Logger.getLogger(OutboxPublisher.class);
    private static final int BATCH_SIZE = 50;

    @Inject
    EntityManager em;

    @Inject
    MqttClientService mqttClientService;

    @Inject
    ObjectMapper objectMapper;

    @Scheduled(cron = "${gruahub.scheduler.outbox-cron:*/1 * * * * ?}")
    @Transactional
    public void processOutbox() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, aggregate_type, aggregate_id, event_type, payload, tenant_id " +
                "FROM outbox_event WHERE status = 'PENDING' " +
                "ORDER BY created_at LIMIT :limit FOR UPDATE SKIP LOCKED")
                .setParameter("limit", BATCH_SIZE)
                .getResultList();

        for (Object[] row : rows) {
            UUID   eventId       = UUID.fromString(row[0].toString());
            String aggregateType = (String) row[1];
            String aggregateId   = row[2] != null ? row[2].toString() : null;
            String eventType     = (String) row[3];
            String payloadStr    = row[4] != null ? row[4].toString() : null;
            String tenantIdStr   = row[5] != null ? row[5].toString() : null;

            try {
                dispatchEvent(aggregateType, eventType, payloadStr, tenantIdStr, aggregateId);

                em.createNativeQuery(
                        "UPDATE outbox_event SET status = 'PUBLISHED', processed_at = :now WHERE id = :id")
                        .setParameter("now", Instant.now())
                        .setParameter("id",  eventId)
                        .executeUpdate();

                LOG.debugf("Outbox event published: id=%s type=%s.%s", eventId, aggregateType, eventType);

            } catch (Exception e) {
                LOG.warnf("Failed to publish outbox event %s [%s.%s]: %s",
                        eventId, aggregateType, eventType, e.getMessage());
                em.createNativeQuery(
                        "UPDATE outbox_event SET status = 'FAILED', error_message = :err, " +
                        "retry_count = retry_count + 1 WHERE id = :id")
                        .setParameter("err", e.getMessage() != null
                                ? e.getMessage().substring(0, Math.min(e.getMessage().length(), 500)) : "error")
                        .setParameter("id",  eventId)
                        .executeUpdate();
            }
        }
    }

    /**
     * Despacha um evento do outbox para o canal correto.
     * Atualmente: GRANT_CREDIT → MQTT publishCommand.
     * Extensão: adicionar outros tipos conforme necessidade.
     */
    private void dispatchEvent(String aggregateType, String eventType,
                                String payloadStr, String tenantIdStr, String aggregateId) throws Exception {

        JsonNode payload = objectMapper.readTree(payloadStr);
        String tenantId = payload.has("tenantId") ? payload.get("tenantId").asText() : tenantIdStr;
        String machineId = payload.has("machineId") ? payload.get("machineId").asText() : null;

        if ("GRANT_CREDIT".equals(eventType) && "credit_grant".equals(aggregateType)) {
            if (machineId == null || machineId.isBlank()) {
                throw new IllegalArgumentException("GRANT_CREDIT payload missing machineId");
            }

            mqttClientService.publishCommand(tenantId, machineId, payloadStr);

            String commandId = payload.has("payload")
                    ? payload.get("payload").path("commandId").asText(null) : null;
            if (commandId != null) {
                markDeviceCommandPublished(commandId, tenantIdStr != null ? tenantIdStr : tenantId);
                if (aggregateId != null) {
                    em.createNativeQuery(
                            "UPDATE credit_grant SET status = 'SENT', sent_at = :now WHERE id = CAST(:id AS uuid) AND status = 'PENDING'")
                            .setParameter("now", Instant.now())
                            .setParameter("id", aggregateId)
                            .executeUpdate();
                }
            }

            LOG.infof("GRANT_CREDIT published via MQTT: tenant=%s machine=%s commandId=%s",
                    tenantId, machineId, commandId);
            return;
        }

        if ("device_command".equals(aggregateType)
                && ("REBOOT".equals(eventType) || "LOCK".equals(eventType) || "UNLOCK".equals(eventType))) {
            if (machineId == null || machineId.isBlank()) {
                throw new IllegalArgumentException(eventType + " payload missing machineId");
            }
            mqttClientService.publishCommand(tenantId, machineId, payloadStr);
            String commandId = payload.has("payload")
                    ? payload.get("payload").path("commandId").asText(null) : null;
            if (commandId != null) {
                markDeviceCommandPublished(commandId, tenantIdStr != null ? tenantIdStr : tenantId);
            }
            LOG.infof("%s published via MQTT: tenant=%s machine=%s commandId=%s",
                    eventType, tenantId, machineId, commandId);
            return;
        }

        LOG.debugf("Outbox event dispatched (no MQTT action): %s.%s", aggregateType, eventType);
    }

    private void markDeviceCommandPublished(String commandId, String tenantId) {
        em.createNativeQuery(
                "UPDATE device_command SET status = 'PUBLISHED', published_at = :now " +
                "WHERE command_id = :cid AND tenant_id = CAST(:tid AS uuid) AND status = 'PENDING'")
                .setParameter("now", Instant.now())
                .setParameter("cid", commandId)
                .setParameter("tid", tenantId)
                .executeUpdate();
    }

    /**
     * Enfileira um evento no outbox dentro da transação corrente.
     * Atômico com a operação de negócio que o chama.
     */
    @Transactional
    public void enqueue(UUID tenantId, String aggregateType, UUID aggregateId,
                        String eventType, String payloadJson) {
        em.createNativeQuery(
                "INSERT INTO outbox_event " +
                "(id, aggregate_type, aggregate_id, event_type, payload, tenant_id) " +
                "VALUES (:id, :aggType, :aggId, :evType, CAST(:payload AS jsonb), :tenantId)")
                .setParameter("id",      UUID.randomUUID())
                .setParameter("aggType", aggregateType)
                .setParameter("aggId",   aggregateId)
                .setParameter("evType",  eventType)
                .setParameter("payload", payloadJson)
                .setParameter("tenantId", tenantId)
                .executeUpdate();
    }
}
