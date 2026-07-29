package com.gruahub.audit.application;

import com.gruahub.shared.infra.CorrelationIdFilter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.jboss.logging.MDC;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class AuditService {

    private static final Logger LOG = Logger.getLogger(AuditService.class);

    @Inject
    EntityManager em;

    @Inject
    JsonWebToken jwt;

    /** Falha de auditoria não propaga ao caller — só loga. */
    public void record(String action, String resourceType,
                       String resourceId, String metadataJson) {
        try {
            UUID tenantId = com.gruahub.shared.domain.TenantContext.getTenantId();
            record(tenantId, action, resourceType, resourceId, metadataJson);
        } catch (Exception e) {
            LOG.warnf("Audit record failed [action=%s resource=%s/%s]: %s",
                    action, resourceType, resourceId, e.getMessage());
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void record(UUID tenantId, String action, String resourceType,
                       String resourceId, String metadataJson) {
        UUID actorUserId = null;
        String email = null;

        try {
            String subject = jwt.getSubject();
            if (subject != null && !subject.isBlank()) {
                actorUserId = UUID.fromString(subject);
            }
        } catch (Exception ignored) {}

        try {
            email = jwt.getClaim("email");
        } catch (Exception ignored) {}

        String correlationId = MDC.get(CorrelationIdFilter.MDC_KEY) != null
                ? MDC.get(CorrelationIdFilter.MDC_KEY).toString()
                : null;

        em.createNativeQuery(
                "INSERT INTO audit_event (id, tenant_id, actor_user_id, actor_email, action, " +
                "resource_type, resource_id, correlation_id, metadata, occurred_at) " +
                "VALUES (:id, :tid, :uid, :email, :action, :resType, :resId, :corr, CAST(:meta AS jsonb), :now)")
                .setParameter("id", UUID.randomUUID())
                .setParameter("tid", tenantId)
                .setParameter("uid", actorUserId)
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
