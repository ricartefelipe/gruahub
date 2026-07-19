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

        if ("GRANT_CREDIT".equals(eventType) && "credit_grant".equals(aggregateType)) {
            // Extrair tenantId e machineId do payload para publicar no tópico correto
            JsonNode payload = objectMapper.readTree(payloadStr);
            String tenantId  = payload.has("tenantId")  ? payload.get("tenantId").asText()  : tenantIdStr;
            String machineId = payload.has("machineId") ? payload.get("machineId").asText() : null;

            if (machineId == null || machineId.isBlank()) {
                throw new IllegalArgumentException("GRANT_CREDIT payload missing machineId");
            }

            mqttClientService.publishCommand(tenantId, machineId, payloadStr);

            // Atualizar device_command como PUBLISHED
            String commandId = payload.has("payload")
                    ? payload.get("payload").path("commandId").asText(null) : null;
            if (commandId != null) {
                em.createNativeQuery(
                        "UPDATE device_command SET status = 'PUBLISHED', published_at = :now " +
                        "WHERE command_id = :cid AND tenant_id = CAST(:tid AS uuid) AND status = 'PENDING'")
                        .setParameter("now", Instant.now())
                        .setParameter("cid", commandId)
                        .setParameter("tid", tenantIdStr != null ? tenantIdStr : tenantId)
                        .executeUpdate();

                // Atualizar credit_grant para SENT
                if (aggregateId != null) {
                    em.createNativeQuery(
                            "UPDATE credit_grant SET status = 'SENT', sent_at = :now WHERE id = CAST(:id AS uuid) AND status = 'PENDING'")
                            .setParameter("now", Instant.now())
                            .setParameter("id",  aggregateId)
                            .executeUpdate();
                }
            }

            LOG.infof("GRANT_CREDIT published via MQTT: tenant=%s machine=%s commandId=%s",
                    tenantId, machineId, commandId);
        } else {
            LOG.debugf("Outbox event dispatched (no MQTT action): %s.%s", aggregateType, eventType);
        }
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
