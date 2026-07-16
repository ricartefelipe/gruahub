package com.gruahub.audit.application;

import com.gruahub.shared.infra.CorrelationIdFilter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.jboss.logging.MDC;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class AuditService {

    @Inject
    EntityManager em;

    @Inject
    JsonWebToken jwt;

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void record(UUID tenantId, String action, String resourceType,
                       String resourceId, String metadataJson) {
        String userId = null;
        String email = null;

        try {
            userId = jwt.getSubject();
            email = jwt.getClaim("email");
        } catch (Exception ignored) {}

        String correlationId = MDC.get(CorrelationIdFilter.MDC_KEY) != null
                ? MDC.get(CorrelationIdFilter.MDC_KEY).toString()
                : null;

        em.createNativeQuery(
                "INSERT INTO audit_event (id, tenant_id, actor_user_id, actor_email, action, " +
                "resource_type, resource_id, correlation_id, metadata, occurred_at) " +
                "VALUES (:id, :tid, :uid::uuid, :email, :action, :resType, :resId, :corr, :meta::jsonb, :now)")
                .setParameter("id", UUID.randomUUID())
                .setParameter("tid", tenantId)
                .setParameter("uid", userId)
                .setParameter("email", email)
                .setParameter("action", action)
                .setParameter("resType", resourceType)
                .setParameter("resId", resourceId)
                .setParameter("corr", correlationId)
                .setParameter("meta", metadataJson != null ? metadataJson : "{}")
                .setParameter("now", Instant.now())
                .executeUpdate();
    }
}
