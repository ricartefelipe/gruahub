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
import java.util.List;
import java.util.UUID;

/**
 * Serviço de domínio IoT.
 * <p>
 * Garantias:
 * - Tenant efetivo vem do tópico MQTT, nunca do JSON payload
 * - Ownership verificada: machineId deve pertencer ao tenantId no banco
 * - Inbox idempotente: INSERT ON CONFLICT DO NOTHING + verificação de rows afetadas
 * - Sequence tracking com detecção de gaps
 * - Duplicidade idêntica → ignorada silenciosamente
 * - PLAY_STARTED idempotente via unique constraint em play_session(credit_grant_id)
 */
@ApplicationScoped
public class IotEventService {

    private static final Logger LOG = Logger.getLogger(IotEventService.class);

    @Inject
    EntityManager em;

    @Inject
    MachineRepository machineRepository;

    @Inject
    CreditService creditService;

    /**
     * Ponto de entrada para toda mensagem MQTT recebida.
     *
     * @param tenantIdStr   UUID do tenant extraído do tópico (autoritativo)
     * @param machineIdStr  UUID da máquina extraído do tópico (autoritativo)
     * @param messageId     ID único da mensagem (campo do envelope)
     * @param messageType   Tipo da mensagem (HEARTBEAT, COMMAND_ACK, etc.)
     * @param schemaVersion Versão do schema já validada pelo processor
     * @param rawPayload    JSON completo da mensagem
     * @param payload       JSON parseado
     */
    @Transactional
    public void handleIncomingMessage(String tenantIdStr, String machineIdStr,
                                      String messageId, String messageType,
                                      int schemaVersion,
                                      String rawPayload, JsonNode payload) {
        UUID tenantId;
        UUID machineId;
        try {
            tenantId  = UUID.fromString(tenantIdStr);
            machineId = UUID.fromString(machineIdStr);
        } catch (IllegalArgumentException e) {
            LOG.warnf("Invalid UUID in MQTT topic: tenant=%s machine=%s", tenantIdStr, machineIdStr);
            return;
        }

        // ── 1. Verificar ownership: machineId deve pertencer ao tenantId ────────
        // Isto é a defesa em profundidade caso a ACL do EMQX não cubra o caso.
        // Um dispositivo autenticado como tenant A não pode interferir no tenant B
        // mesmo que consiga publicar no tópico errado.
        if (!machineExistsForTenant(machineId, tenantId)) {
            LOG.warnf(
                "MQTT ownership violation: machine %s does not belong to tenant %s "
                + "[messageId=%s type=%s] — rejected",
                machineId, tenantId, messageId, messageType);
            return;
        }

        // ── 2. Inbox idempotente via INSERT ON CONFLICT DO NOTHING ──────────────
        // A unique constraint uq_device_message_inbox_key (message_id, tenant_id)
        // garante que dois threads concorrentes com o mesmo messageId só inserirão uma vez.
        // O segundo verá rows=0 e retornará imediatamente.
        int rows = em.createNativeQuery(
                "INSERT INTO device_message_inbox " +
                "(id, message_id, tenant_id, machine_id, message_type, " +
                " schema_version, payload, status, received_at) " +
                "VALUES (:id, :mid, :tid, :macid, :type, :sv, CAST(:payload AS jsonb), 'RECEIVED', :now) " +
                "ON CONFLICT (message_id, tenant_id) DO NOTHING")
                .setParameter("id",      UUID.randomUUID())
                .setParameter("mid",     messageId)
                .setParameter("tid",     tenantId)
                .setParameter("macid",   machineId)
                .setParameter("type",    messageType)
                .setParameter("sv",      schemaVersion)
                .setParameter("payload", rawPayload)
                .setParameter("now",     Instant.now())
                .executeUpdate();

        if (rows == 0) {
            // Mensagem já processada anteriormente — duplicata idêntica ignorada
            LOG.debugf("Duplicate MQTT message messageId=%s tenant=%s — skipped", messageId, tenantId);
            return;
        }

        // ── 3. Sequence tracking ────────────────────────────────────────────────
        long sequence = payload.has("sequence") ? payload.get("sequence").asLong(-1L) : -1L;
        if (sequence >= 0) {
            checkAndUpdateSequence(machineId, tenantId, sequence, messageId, messageType);
        }

        // ── 4. Roteamento por tipo ──────────────────────────────────────────────
        switch (messageType) {
            case "HEARTBEAT", "STATUS_REPORT" -> handleHeartbeat(tenantId, machineId, payload, messageId);
            case "COMMAND_ACK"                -> handleCommandAck(tenantId, machineId, payload);
            case "CREDIT_RECEIVED"            -> handleCreditReceived(tenantId, machineId, payload);
            case "PLAY_STARTED"               -> handlePlayStarted(tenantId, machineId, payload);
            case "PLAY_COMPLETED"             -> handlePlayCompleted(tenantId, machineId, payload);
            case "ERROR_REPORT"               -> handleErrorReport(tenantId, machineId, payload);
            default -> LOG.debugf("Unhandled MQTT message type: %s [messageId=%s]", messageType, messageId);
        }

        // ── 5. Marcar como processado ───────────────────────────────────────────
        em.createNativeQuery(
                "UPDATE device_message_inbox SET status = 'PROCESSED', processed_at = :now " +
                "WHERE message_id = :mid AND tenant_id = :tid")
                .setParameter("now", Instant.now())
                .setParameter("mid", messageId)
                .setParameter("tid", tenantId)
                .executeUpdate();
    }

    // ── Verificação de ownership ─────────────────────────────────────────────────

    private boolean machineExistsForTenant(UUID machineId, UUID tenantId) {
        Long count = (Long) em.createNativeQuery(
                "SELECT COUNT(*) FROM machine WHERE id = :mid AND tenant_id = :tid")
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .getSingleResult();
        return count != null && count > 0;
    }

    // ── Sequence tracking ────────────────────────────────────────────────────────

    /**
     * Verifica e atualiza a sequência da máquina.
     * Detecta gaps (out-of-order severo) e gera alerta.
     * Política: aceitar mensagens fora de ordem — não descartar.
     * Gap detectado → alerta, mas mensagem ainda processada.
     */
    private void checkAndUpdateSequence(UUID machineId, UUID tenantId,
                                        long newSeq, String messageId, String messageType) {
        @SuppressWarnings("unchecked")
        List<Object> result = em.createNativeQuery(
                "SELECT last_sequence FROM machine_reported_state WHERE machine_id = :mid AND tenant_id = :tid")
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .getResultList();

        if (!result.isEmpty() && result.get(0) != null) {
            long lastSeq = ((Number) result.get(0)).longValue();
            long gap = newSeq - lastSeq - 1;

            if (gap > 0) {
                // Gap detectado: sequências puladas
                LOG.warnf("Sequence gap detected on machine %s: lastSeq=%d newSeq=%d gap=%d "
                        + "[messageId=%s type=%s] — processing anyway",
                        machineId, lastSeq, newSeq, gap, messageId, messageType);

                em.createNativeQuery(
                        "INSERT INTO alert (id, tenant_id, alert_type, severity, machine_id, " +
                        "title, message, status, created_at) " +
                        "SELECT gen_random_uuid(), :tid, 'SEQUENCE_GAP', 'INFO', :mid, " +
                        "'Sequence Gap Detectado', :msg, 'OPEN', :now " +
                        "WHERE NOT EXISTS (" +
                        "  SELECT 1 FROM alert a " +
                        "  WHERE a.tenant_id = :tid AND a.machine_id = :mid " +
                        "  AND a.alert_type = 'SEQUENCE_GAP' AND a.status = 'OPEN'" +
                        ")")
                        .setParameter("tid", tenantId)
                        .setParameter("mid", machineId)
                        .setParameter("msg", String.format(
                                "Gap de %d mensagens detectado (lastSeq=%d, newSeq=%d)",
                                gap, lastSeq, newSeq))
                        .setParameter("now", Instant.now())
                        .executeUpdate();

            } else if (newSeq < lastSeq) {
                // Out-of-order: mensagem com sequência inferior à última vista
                // Política: processar mas logar
                LOG.infof("Out-of-order message on machine %s: lastSeq=%d newSeq=%d "
                        + "[messageId=%s type=%s] — processing (late delivery)",
                        machineId, lastSeq, newSeq, messageId, messageType);
                return; // Não atualizar last_sequence para mensagens atrasadas
            }
        }

        // Atualizar last_sequence apenas se for maior que o atual
        em.createNativeQuery(
                "UPDATE machine_reported_state SET last_sequence = :seq, last_message_id = :mid, " +
                "last_message_at = :now " +
                "WHERE machine_id = :macid AND tenant_id = :tid AND (last_sequence IS NULL OR last_sequence < :seq)")
                .setParameter("seq",   newSeq)
                .setParameter("mid",   messageId)
                .setParameter("now",   Instant.now())
                .setParameter("macid", machineId)
                .setParameter("tid",   tenantId)
                .executeUpdate();
    }

    // ── Handlers de eventos ──────────────────────────────────────────────────────

    private void handleHeartbeat(UUID tenantId, UUID machineId, JsonNode payload, String messageId) {
        Instant now = Instant.now();

        em.createNativeQuery(
                "INSERT INTO machine_reported_state " +
                "(id, machine_id, tenant_id, online, last_heartbeat_at, last_message_id, " +
                " last_message_at, updated_at) " +
                "VALUES (:id, :mid, :tid, true, :now, :msgId, :now, :now) " +
                "ON CONFLICT (machine_id) DO UPDATE SET " +
                "online = true, last_heartbeat_at = :now, last_message_id = :msgId, " +
                "last_message_at = :now, updated_at = :now")
                .setParameter("id",    UUID.randomUUID())
                .setParameter("mid",   machineId)
                .setParameter("tid",   tenantId)
                .setParameter("now",   now)
                .setParameter("msgId", messageId)
                .executeUpdate();

        // Transição OFFLINE → ACTIVE
        machineRepository.findByIdAndTenant(machineId, tenantId).ifPresent(m -> {
            if (m.getStatus() == MachineStatus.OFFLINE) {
                m.markOnline();
                LOG.infof("Machine %s came back online", machineId);
            }
            m.setLastSeenAt(now);
        });

        LOG.debugf("Heartbeat: machine=%s", machineId);
    }

    private void handleCommandAck(UUID tenantId, UUID machineId, JsonNode payload) {
        String commandId = payload.path("payload").path("commandId").asText(null);
        String ackStatus = payload.path("payload").path("status").asText("EXECUTED");

        if (commandId == null || commandId.isBlank()) {
            LOG.warnf("COMMAND_ACK received without commandId from machine %s", machineId);
            return;
        }

        // Atualizar estado do comando no device_command (idempotente via WHERE status = PENDING)
        int updated = em.createNativeQuery(
                "UPDATE device_command SET status = :status, acked_at = :now " +
                "WHERE command_id = :cid AND tenant_id = :tid AND machine_id = :mid " +
                "AND status IN ('PENDING', 'PUBLISHED')")
                .setParameter("status", ackStatus)
                .setParameter("now",    Instant.now())
                .setParameter("cid",    commandId)
                .setParameter("tid",    tenantId)
                .setParameter("mid",    machineId)
                .executeUpdate();

        if (updated == 0) {
            LOG.debugf("COMMAND_ACK for already-acked or unknown command=%s machine=%s "
                    + "— ignored (idempotent)", commandId, machineId);
        }

        // Se foi ACK de crédito, atualizar o credit_grant
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);
        if (creditGrantId != null && !creditGrantId.isBlank()) {
            try {
                creditService.acknowledgeCredit(UUID.fromString(creditGrantId), tenantId);
                LOG.infof("Credit ACK: commandId=%s creditGrantId=%s machine=%s status=%s",
                        commandId, creditGrantId, machineId, ackStatus);
            } catch (IllegalArgumentException e) {
                LOG.warnf("Invalid creditGrantId in COMMAND_ACK: %s machine=%s", creditGrantId, machineId);
            }
        }
    }

    private void handleCreditReceived(UUID tenantId, UUID machineId, JsonNode payload) {
        // CREDIT_RECEIVED é uma confirmação alternativa de recebimento de crédito.
        // Tratado da mesma forma que COMMAND_ACK para o creditGrantId.
        String commandId    = payload.path("payload").path("commandId").asText(null);
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);

        if (commandId != null && !commandId.isBlank()) {
            em.createNativeQuery(
                    "UPDATE device_command SET status = 'EXECUTED', acked_at = :now " +
                    "WHERE command_id = :cid AND tenant_id = :tid AND machine_id = :mid " +
                    "AND status IN ('PENDING', 'PUBLISHED')")
                    .setParameter("now", Instant.now())
                    .setParameter("cid", commandId)
                    .setParameter("tid", tenantId)
                    .setParameter("mid", machineId)
                    .executeUpdate();
        }

        if (creditGrantId != null && !creditGrantId.isBlank()) {
            try {
                creditService.acknowledgeCredit(UUID.fromString(creditGrantId), tenantId);
            } catch (IllegalArgumentException e) {
                LOG.warnf("Invalid creditGrantId in CREDIT_RECEIVED: %s machine=%s", creditGrantId, machineId);
            }
        }
    }

    private void handlePlayStarted(UUID tenantId, UUID machineId, JsonNode payload) {
        String creditGrantId = payload.path("payload").path("creditGrantId").asText(null);
        if (creditGrantId == null || creditGrantId.isBlank()) {
            LOG.warnf("PLAY_STARTED without creditGrantId from machine %s — ignored", machineId);
            return;
        }

        // Unique constraint uq_play_session_credit_grant (migration 018) garante
        // que ON CONFLICT DO NOTHING evita sessões duplicadas para o mesmo crédito.
        int rows = em.createNativeQuery(
                "INSERT INTO play_session " +
                "(id, tenant_id, machine_id, credit_grant_id, status, started_at, created_at) " +
                "VALUES (:id, :tid, :mid, CAST(:cgid AS uuid), 'STARTED', :now, :now) " +
                "ON CONFLICT (credit_grant_id) DO NOTHING")
                .setParameter("id",   UUID.randomUUID())
                .setParameter("tid",  tenantId)
                .setParameter("mid",  machineId)
                .setParameter("cgid", creditGrantId)
                .setParameter("now",  Instant.now())
                .executeUpdate();

        if (rows == 0) {
            LOG.debugf("Duplicate PLAY_STARTED for creditGrantId=%s — ignored", creditGrantId);
        } else {
            LOG.infof("Play started: machine=%s credit=%s", machineId, creditGrantId);
        }
    }

    private void handlePlayCompleted(UUID tenantId, UUID machineId, JsonNode payload) {
        String creditGrantId  = payload.path("payload").path("creditGrantId").asText(null);
        boolean prizeDelivered = payload.path("payload").path("prizeDelivered").asBoolean(false);

        if (creditGrantId == null || creditGrantId.isBlank()) {
            LOG.warnf("PLAY_COMPLETED without creditGrantId from machine %s — ignored", machineId);
            return;
        }

        // WHERE status = 'STARTED' garante idempotência
        int rows = em.createNativeQuery(
                "UPDATE play_session SET status = 'COMPLETED', prize_delivered = :prize, " +
                "completed_at = :now " +
                "WHERE credit_grant_id = CAST(:cgid AS uuid) AND tenant_id = :tid AND status = 'STARTED'")
                .setParameter("prize", prizeDelivered)
                .setParameter("now",   Instant.now())
                .setParameter("cgid",  creditGrantId)
                .setParameter("tid",   tenantId)
                .executeUpdate();

        if (rows == 0) {
            LOG.debugf("PLAY_COMPLETED for credit=%s but no STARTED session found "
                    + "(duplicate or out-of-order) — ignored", creditGrantId);
            return;
        }

        // Consumir o crédito (idempotente no CreditService)
        try {
            creditService.consumeCredit(UUID.fromString(creditGrantId), tenantId);
        } catch (IllegalArgumentException e) {
            LOG.warnf("Invalid creditGrantId in PLAY_COMPLETED: %s machine=%s", creditGrantId, machineId);
            return;
        }

        LOG.infof("Play completed: machine=%s credit=%s prizeDelivered=%s",
                machineId, creditGrantId, prizeDelivered);
    }

    private void handleErrorReport(UUID tenantId, UUID machineId, JsonNode payload) {
        boolean doorOpen   = payload.path("payload").path("doorOpen").asBoolean(false);
        boolean motorFault = payload.path("payload").path("motorFault").asBoolean(false);
        String errorCode   = payload.path("payload").path("errorCode").asText("UNKNOWN");

        em.createNativeQuery(
                "UPDATE machine_reported_state SET door_open = :door, motor_fault = :motor, " +
                "updated_at = :now WHERE machine_id = :mid AND tenant_id = :tid")
                .setParameter("door",  doorOpen)
                .setParameter("motor", motorFault)
                .setParameter("now",   Instant.now())
                .setParameter("mid",   machineId)
                .setParameter("tid",   tenantId)
                .executeUpdate();

        // Gerar alerta para erros críticos
        if (motorFault || doorOpen) {
            String alertType = motorFault ? "MOTOR_FAULT" : "DOOR_OPEN";
            String title     = motorFault ? "Falha de Motor" : "Porta Aberta";
            LOG.warnf("Error report from machine %s: errorCode=%s doorOpen=%s motorFault=%s",
                    machineId, errorCode, doorOpen, motorFault);

            em.createNativeQuery(
                    "INSERT INTO alert (id, tenant_id, alert_type, severity, machine_id, " +
                    "title, message, status, created_at) " +
                    "VALUES (gen_random_uuid(), :tid, :atype, 'ERROR', :mid, " +
                    ":title, :msg, 'OPEN', :now) " +
                    "ON CONFLICT DO NOTHING")
                    .setParameter("tid",   tenantId)
                    .setParameter("atype", alertType)
                    .setParameter("mid",   machineId)
                    .setParameter("title", title)
                    .setParameter("msg",   "errorCode=" + errorCode)
                    .setParameter("now",   Instant.now())
                    .executeUpdate();
        }
    }
}
