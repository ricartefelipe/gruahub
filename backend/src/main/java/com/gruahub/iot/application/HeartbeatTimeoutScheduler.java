package com.gruahub.iot.application;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Detecta máquinas sem heartbeat recente e as marca OFFLINE.
 * Gera alertas para máquinas que ficaram offline.
 */
@ApplicationScoped
public class HeartbeatTimeoutScheduler {

    private static final Logger LOG = Logger.getLogger(HeartbeatTimeoutScheduler.class);

    @ConfigProperty(name = "gruahub.mqtt.heartbeat-timeout-seconds", defaultValue = "120")
    int heartbeatTimeoutSeconds;

    @Inject
    EntityManager em;

    @Scheduled(cron = "${gruahub.scheduler.heartbeat-timeout-cron:*/30 * * * * ?}")
    @Transactional
    public void checkHeartbeatTimeouts() {
        Instant cutoff = Instant.now().minus(heartbeatTimeoutSeconds, ChronoUnit.SECONDS);

        // Máquinas com estado reportado que estavam online mas sem heartbeat recente
        @SuppressWarnings("unchecked")
        var timedOut = em.createNativeQuery(
                "SELECT mrs.machine_id, mrs.tenant_id FROM machine_reported_state mrs " +
                "JOIN machine m ON m.id = mrs.machine_id " +
                "WHERE mrs.online = true AND mrs.last_heartbeat_at < :cutoff " +
                "AND m.status = 'ACTIVE'")
                .setParameter("cutoff", cutoff)
                .getResultList();

        for (Object row : timedOut) {
            Object[] r = (Object[]) row;
            Object machineId = r[0];
            Object tenantId = r[1];

            LOG.warnf("Machine %s (tenant %s) timed out — marking OFFLINE", machineId, tenantId);

            // Marcar estado reportado como offline
            em.createNativeQuery(
                    "UPDATE machine_reported_state SET online = false, updated_at = :now " +
                    "WHERE machine_id = :mid")
                    .setParameter("now", Instant.now())
                    .setParameter("mid", machineId)
                    .executeUpdate();

            // Marcar máquina como OFFLINE
            em.createNativeQuery(
                    "UPDATE machine SET status = 'OFFLINE', updated_at = :now " +
                    "WHERE id = :mid AND tenant_id = :tid AND status = 'ACTIVE'")
                    .setParameter("now", Instant.now())
                    .setParameter("mid", machineId)
                    .setParameter("tid", tenantId)
                    .executeUpdate();

            // Gerar alerta
            em.createNativeQuery(
                    "INSERT INTO alert (id, tenant_id, alert_type, severity, machine_id, " +
                    "title, message, status, created_at) " +
                    "VALUES (gen_random_uuid(), :tid, 'MACHINE_OFFLINE', 'WARNING', :mid, " +
                    "'Máquina Offline', 'Máquina sem heartbeat por mais de " + heartbeatTimeoutSeconds + "s', " +
                    "'OPEN', :now) " +
                    "ON CONFLICT DO NOTHING")
                    .setParameter("tid", tenantId)
                    .setParameter("mid", machineId)
                    .setParameter("now", Instant.now())
                    .executeUpdate();
        }

        if (!timedOut.isEmpty()) {
            LOG.infof("Heartbeat timeout: marked %d machine(s) OFFLINE", timedOut.size());
        }
    }
}
