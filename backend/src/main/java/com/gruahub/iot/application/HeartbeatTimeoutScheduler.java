package com.gruahub.iot.application;

import com.gruahub.notifications.domain.PushNotifier;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@ApplicationScoped
public class HeartbeatTimeoutScheduler {

    private static final Logger LOG = Logger.getLogger(HeartbeatTimeoutScheduler.class);

    @ConfigProperty(name = "gruahub.mqtt.heartbeat-timeout-seconds", defaultValue = "120")
    int heartbeatTimeoutSeconds;

    @Inject
    EntityManager em;

    @Inject
    PushNotifier pushNotifier;

    @Scheduled(cron = "${gruahub.scheduler.heartbeat-timeout-cron:*/30 * * * * ?}")
    @Transactional
    public void checkHeartbeatTimeouts() {
        Instant cutoff = Instant.now().minus(heartbeatTimeoutSeconds, ChronoUnit.SECONDS);
        Instant now = Instant.now();

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

            em.createNativeQuery(
                    "UPDATE machine_reported_state SET online = false, updated_at = :now " +
                    "WHERE machine_id = :mid")
                    .setParameter("now", now)
                    .setParameter("mid", machineId)
                    .executeUpdate();

            em.createNativeQuery(
                    "UPDATE machine SET status = 'OFFLINE', updated_at = :now " +
                    "WHERE id = :mid AND tenant_id = :tid AND status = 'ACTIVE'")
                    .setParameter("now", now)
                    .setParameter("mid", machineId)
                    .setParameter("tid", tenantId)
                    .executeUpdate();

            String offlineMsg = "Máquina sem heartbeat por mais de " + heartbeatTimeoutSeconds + "s";
            int inserted = em.createNativeQuery(
                    "INSERT INTO alert (id, tenant_id, alert_type, severity, machine_id, " +
                    "title, message, status, created_at) " +
                    "SELECT gen_random_uuid(), :tid, 'MACHINE_OFFLINE', 'WARNING', :mid, " +
                    "'Máquina Offline', :msg, 'OPEN', :now " +
                    "WHERE NOT EXISTS (" +
                    "  SELECT 1 FROM alert a " +
                    "  WHERE a.tenant_id = :tid AND a.machine_id = :mid " +
                    "  AND a.alert_type = 'MACHINE_OFFLINE' AND a.status = 'OPEN'" +
                    ")")
                    .setParameter("tid", tenantId)
                    .setParameter("mid", machineId)
                    .setParameter("msg", offlineMsg)
                    .setParameter("now", now)
                    .executeUpdate();

            if (inserted > 0) {
                pushNotifier.notify(new PushNotifier.PushMessage(
                        toUuid(tenantId),
                        toUuid(machineId),
                        "MACHINE_OFFLINE",
                        "WARNING",
                        "Máquina Offline",
                        offlineMsg));
            }
        }

        if (!timedOut.isEmpty()) {
            LOG.infof("Heartbeat timeout: marked %d machine(s) OFFLINE", timedOut.size());
        }
    }

    private static UUID toUuid(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID uuid) {
            return uuid;
        }
        return UUID.fromString(value.toString());
    }
}
