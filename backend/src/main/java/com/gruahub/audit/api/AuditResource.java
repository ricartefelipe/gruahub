package com.gruahub.audit.api;

import com.gruahub.shared.domain.TenantContext;
import com.gruahub.shared.api.PageResponse;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * REST resource para consulta do log de auditoria.
 * O log é append-only — não há mutações via esta API.
 */
@Path("/api/v1/audit")
@Produces(MediaType.APPLICATION_JSON)
@RequestScoped
public class AuditResource {

    @Inject
    EntityManager em;

    public record AuditEventResponse(
        UUID id,
        UUID tenantId,
        String actorUserId,
        String actorEmail,
        String action,
        String resourceType,
        String resourceId,
        String metadata,
        String correlationId,
        String ipAddress,
        Instant occurredAt
    ) {}

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public PageResponse<AuditEventResponse> listEvents(
        @QueryParam("action") String action,
        @QueryParam("resourceType") String resourceType,
        @QueryParam("actorId") String actorId,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("100") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 500);
        StringBuilder where = new StringBuilder("WHERE tenant_id = :tid ");
        if (action != null) where.append("AND action LIKE :action ");
        if (resourceType != null) where.append("AND resource_type = :rt ");
        if (actorId != null) where.append("AND actor_user_id = :aid ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM audit_event " + where
        ).setParameter("tid", tenantId);
        if (action != null) countQuery.setParameter("action", action + "%");
        if (resourceType != null) countQuery.setParameter("rt", resourceType);
        if (actorId != null) countQuery.setParameter("aid", actorId);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT id, tenant_id, actor_user_id, actor_email, action, resource_type, " +
            "resource_id, metadata, correlation_id, ip_address, occurred_at " +
            "FROM audit_event " + where +
            "ORDER BY occurred_at DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);

        if (action != null) q.setParameter("action", action + "%");
        if (resourceType != null) q.setParameter("rt", resourceType);
        if (actorId != null) q.setParameter("aid", actorId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        var content = rows.stream().map(r -> new AuditEventResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2], (String) r[3],
            (String) r[4], (String) r[5], (String) r[6], (String) r[7],
            (String) r[8], (String) r[9],
            r[10] != null ? ((java.sql.Timestamp) r[10]).toInstant() : null
        )).toList();
        return PageResponse.of(content, page, lim, total);
    }
}
