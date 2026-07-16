package com.gruahub.shared.infra;

import com.gruahub.shared.domain.TenantContext;
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
 * Processa eventos do outbox transacional e os publica.
 * Por simplicidade no MVP, o próprio scheduler é o dispatcher.
 * Em produção, substituir por CDC (Debezium) ou Kafka.
 */
@ApplicationScoped
public class OutboxPublisher {

    private static final Logger LOG = Logger.getLogger(OutboxPublisher.class);
    private static final int BATCH_SIZE = 50;

    @Inject
    EntityManager em;

    @Scheduled(cron = "${gruahub.scheduler.outbox-cron:*/1 * * * * ?}")
    @Transactional
    public void processOutbox() {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, aggregate_type, aggregate_id, event_type, payload, tenant_id " +
                "FROM outbox_event WHERE status = 'PENDING' ORDER BY created_at LIMIT :limit " +
                "FOR UPDATE SKIP LOCKED")
                .setParameter("limit", BATCH_SIZE)
                .getResultList();

        for (Object[] row : rows) {
            UUID eventId = UUID.fromString(row[0].toString());
            String aggregateType = (String) row[1];
            String eventType = (String) row[3];

            try {
                // Dispatch por tipo de evento (IoT MQTT publish, webhooks, etc.)
                dispatchEvent(aggregateType, eventType, row);

                em.createNativeQuery(
                        "UPDATE outbox_event SET status = 'PUBLISHED', processed_at = :now WHERE id = :id")
                        .setParameter("now", Instant.now())
                        .setParameter("id", eventId)
                        .executeUpdate();

            } catch (Exception e) {
                LOG.errorf("Failed to process outbox event %s: %s", eventId, e.getMessage());
                em.createNativeQuery(
                        "UPDATE outbox_event SET status = 'FAILED', error_message = :err, " +
                        "retry_count = retry_count + 1 WHERE id = :id")
                        .setParameter("err", e.getMessage())
                        .setParameter("id", eventId)
                        .executeUpdate();
            }
        }
    }

    private void dispatchEvent(String aggregateType, String eventType, Object[] row) {
        // Extensão ponto: cada módulo pode registrar um OutboxEventHandler
        // No MVP, o módulo IoT injeta o MqttCommandPublisher e processa via evento
        LOG.debugf("Outbox event dispatched: %s.%s", aggregateType, eventType);
    }

    @Transactional
    public void enqueue(UUID tenantId, String aggregateType, UUID aggregateId,
                        String eventType, String payloadJson) {
        em.createNativeQuery(
                "INSERT INTO outbox_event (id, aggregate_type, aggregate_id, event_type, payload, tenant_id) " +
                "VALUES (:id, :aggType, :aggId, :evType, :payload::jsonb, :tenantId)")
                .setParameter("id", UUID.randomUUID())
                .setParameter("aggType", aggregateType)
                .setParameter("aggId", aggregateId)
                .setParameter("evType", eventType)
                .setParameter("payload", payloadJson)
                .setParameter("tenantId", tenantId)
                .executeUpdate();
    }
}
