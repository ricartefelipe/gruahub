package com.gruahub.iot.application;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;

@ApplicationScoped
public class CommandTtlScheduler {

    private static final Logger LOG = Logger.getLogger(CommandTtlScheduler.class);

    @Inject
    EntityManager em;

    @Scheduled(cron = "${gruahub.scheduler.command-ttl-cron:*/10 * * * * ?}")
    @Transactional
    public void expireStaleCommands() {
        Instant now = Instant.now();
        int expired = em.createNativeQuery(
                "UPDATE device_command SET status = 'EXPIRED' " +
                "WHERE status IN ('PENDING', 'PUBLISHED', 'DELIVERED') " +
                "AND expires_at IS NOT NULL AND expires_at < :now")
                .setParameter("now", now)
                .executeUpdate();

        if (expired > 0) {
            LOG.infof("Command TTL: expired %d device command(s)", expired);
        }
    }
}
