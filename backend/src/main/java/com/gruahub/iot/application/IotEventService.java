package com.gruahub.iot.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.gruahub.fleet.domain.MachineStatus;
import com.gruahub.fleet.infra.MachineRepository;
import com.gruahub.plays.application.CreditService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class IotEventService {

    private static final Logger LOG = Logger.getLogger(IotEventService.class);

    @Inject
    EntityManager em;

    @Inject
    MachineRepository machineRepository;

    @Inject
    CreditService creditService;

    @Transactional
    public void handleIncomingMessage(String tenantIdStr, String machineIdStr,
                                       String messageId, String messageType,
                                       String rawPayload, JsonNode payload) {
        UUID tenantId;
        UUID machineId;
        try {
            tenantId = UUID.fromString(tenantIdStr);
            machineId = UUID.fromString(machineIdStr);
        } catch (IllegalArgumentException e) {
            LOG.warnf("Invalid UUID in MQTT topic: tenant=%s machine=%s", tenantIdStr, machineIdStr);
            return;
        }

        // Verificar duplicata por messageId (inbox pattern)
        var existing = em.createNativeQuery(
                "SELECT 1 FROM device_message_inbox WHERE message_id = :mid AND tenant_id = :tid")
                .setParameter("mid", messageId)
                .setParameter("tid", tenantId)
                .getResultList();

        if (!existing.isEmpty()) {
            LOG.debugf("Duplicate MQTT message %s — skipped", messageId);
            return;
        }

        // Registrar no inbox
        em.createNativeQuery(
                "INSERT INTO device_message_inbox (id, message_id, tenant_id, machine_id, " +
                "message_type, payload, status, received_at) " +
                "VALUES (:id, :mid, :tid, :macid, :type, :payload::jsonb, 'RECEIVED', :now)")
                .setParameter("id", UUID.randomUUID())
                .setParameter("mid", messageId)
                .setParameter("tid", tenantId)
                .setParameter("macid", machineId)
                .setParameter("type", messageType)
                .setParameter("payload", rawPayload)
                .setParameter("now", Instant.now())
                .executeUpdate();

        // Processar por tipo
        switch (messageType) {
            case "HEARTBEAT", "STATUS_REPORT" -> handleHeartbeat(tenantId, machineId, payload);
            case "COMMAND_ACK" -> handleCommandAck(tenantId, machineId, payload);
            case "PLAY_STARTED" -> handlePlayStarted(tenantId, machineId, payload);
            case "PLAY_COMPLETED" -> handlePlayCompleted(tenantId, machineId, payload);
            case "CREDIT_RECEIVED" -> handleCreditReceived(tenantId, machineId, payload);
            case "ERROR_REPORT" -> handleErrorReport(tenantId, machineId, payload);
            default -> LOG.debugf("Unhandled MQTT message type: %s", messageType);
        }
    }

    private void handleHeartbeat(UUID tenantId, UUID machineId, JsonNode payload) {
        Instant now = Instant.now();

        // Atualizar/inserir estado reportado
        em.createNativeQuery(
                "INSERT INTO machine_reported_state (id, machine_id, tenant_id, online, " +
                "last_heartbeat_at, updated_at) " +
                "VALUES (:id, :mid, :tid, true, :now, :now) " +
                "ON CONFLICT (machine_id) DO UPDATE SET " +
                "online = true, last_heartbeat_at = :now, updated_at = :now")
                .setParameter("id", UUID.randomUUID())
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .setParameter("now", now)
                .executeUpdate();

        // Se máquina estava OFFLINE, colocar de volta como ACTIVE
        machineRepository.findByIdAndTenant(machineId, tenantId).ifPresent(m -> {
            if (m.getStatus() == MachineStatus.OFFLINE) {
                m.markOnline();
            }
            m.setLastSeenAt(now);
        });

        LOG.debugf("Heartbeat from machine %s", machineId);
    }

    private void handleCommandAck(UUID tenantId, UUID machineId, JsonNode payload) {
        String commandId = payload.path("payload").path("commandId").asText();
        String ackStatus = payload.path("payload").path("status").asText("EXECUTED");

        em.createNativeQuery(
                "UPDATE device_command SET status = :status, acked_at = :now " +
                "WHERE command_id = :cid AND tenant_id = :tid AND machine_id = :mid")
                .setParameter("status", ackStatus)
                .setParameter("now", Instant.now())
                .setParameter("cid", commandId)
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .executeUpdate();

        // Se foi ACK de crédito, atualizar o credit_grant
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);
        if (creditGrantId != null && !creditGrantId.isBlank()) {
            creditService.acknowledgeCredit(UUID.fromString(creditGrantId), tenantId);
        }

        LOG.infof("Command ACK received: commandId=%s status=%s machine=%s", commandId, ackStatus, machineId);
    }

    private void handlePlayStarted(UUID tenantId, UUID machineId, JsonNode payload) {
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);
        if (creditGrantId == null) return;

        em.createNativeQuery(
                "INSERT INTO play_session (id, tenant_id, machine_id, credit_grant_id, " +
                "status, started_at, created_at) " +
                "VALUES (:id, :tid, :mid, :cgid::uuid, 'STARTED', :now, :now) " +
                "ON CONFLICT DO NOTHING")
                .setParameter("id", UUID.randomUUID())
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("cgid", creditGrantId)
                .setParameter("now", Instant.now())
                .executeUpdate();

        LOG.infof("Play started: machine=%s credit=%s", machineId, creditGrantId);
    }

    private void handlePlayCompleted(UUID tenantId, UUID machineId, JsonNode payload) {
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);
        boolean prizeDelivered = payload.path("payload").path("prizeDelivered").asBoolean(false);

        if (creditGrantId == null) return;

        em.createNativeQuery(
                "UPDATE play_session SET status = 'COMPLETED', prize_delivered = :prize, " +
                "completed_at = :now " +
                "WHERE credit_grant_id = :cgid::uuid AND tenant_id = :tid AND status = 'STARTED'")
                .setParameter("prize", prizeDelivered)
                .setParameter("now", Instant.now())
                .setParameter("cgid", creditGrantId)
                .setParameter("tid", tenantId)
                .executeUpdate();

        // Consumir o crédito
        creditService.consumeCredit(UUID.fromString(creditGrantId), tenantId);

        LOG.infof("Play completed: machine=%s credit=%s prizeDelivered=%s",
                machineId, creditGrantId, prizeDelivered);
    }

    private void handleCreditReceived(UUID tenantId, UUID machineId, JsonNode payload) {
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);
        if (creditGrantId == null) return;
        creditService.acknowledgeCredit(UUID.fromString(creditGrantId), tenantId);
    }

    private void handleErrorReport(UUID tenantId, UUID machineId, JsonNode payload) {
        boolean doorOpen = payload.path("payload").path("doorOpen").asBoolean(false);
        boolean motorFault = payload.path("payload").path("motorFault").asBoolean(false);

        em.createNativeQuery(
                "UPDATE machine_reported_state SET door_open = :door, motor_fault = :motor, " +
                "updated_at = :now WHERE machine_id = :mid AND tenant_id = :tid")
                .setParameter("door", doorOpen)
                .setParameter("motor", motorFault)
                .setParameter("now", Instant.now())
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .executeUpdate();

        LOG.warnf("Error report from machine %s: doorOpen=%s motorFault=%s",
                machineId, doorOpen, motorFault);
    }
}
