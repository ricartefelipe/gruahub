package com.gruahub.alerts.api;

import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.api.PageResponse;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.audit.application.AuditService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.SecurityContext;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/v1/alerts")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class AlertResource {

    private static final Logger LOG = Logger.getLogger(AlertResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public record AlertResponse(
        UUID id,
        UUID machineId,
        String machineAssetNumber,
        String alertType,
        String severity,
        String status,
        String message,
        Instant occurredAt,
        Instant acknowledgedAt,
        String acknowledgedBy
    ) {}

    public record AcknowledgeRequest(String note) {}

    // ── Queries ─────────────────────────────────────────────────────────────────

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "TECHNICIAN", "FINANCE"})
    public PageResponse<AlertResponse> listAlerts(
        @QueryParam("status") @DefaultValue("OPEN") String status,
        @QueryParam("severity") String severity,
        @QueryParam("machineId") UUID machineId,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        LOG.debugf("[%s] GET /alerts status=%s severity=%s", tenantId, status, severity);

        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE a.tenant_id = :tid ");
        if (!"ALL".equalsIgnoreCase(status)) where.append("AND a.status = :status ");
        if (severity != null) where.append("AND a.severity = :severity ");
        if (machineId != null) where.append("AND a.machine_id = :machineId ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM alert a " + where
        ).setParameter("tid", tenantId);
        if (!"ALL".equalsIgnoreCase(status)) countQuery.setParameter("status", status);
        if (severity != null) countQuery.setParameter("severity", severity);
        if (machineId != null) countQuery.setParameter("machineId", machineId);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT a.id, a.machine_id, m.asset_number, a.alert_type, a.severity, " +
            "a.status, a.message, COALESCE(a.occurred_at, a.created_at), a.acknowledged_at, a.acknowledged_by " +
            "FROM alert a " +
            "LEFT JOIN machine m ON m.id = a.machine_id " +
            where +
            "ORDER BY COALESCE(a.occurred_at, a.created_at) DESC LIMIT :lim OFFSET :off";

        var query = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);

        if (!"ALL".equalsIgnoreCase(status)) query.setParameter("status", status);
        if (severity != null) query.setParameter("severity", severity);
        if (machineId != null) query.setParameter("machineId", machineId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        return PageResponse.of(rows.stream().map(this::mapRow).toList(), page, lim, total);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "TECHNICIAN", "FINANCE"})
    public AlertResponse getAlert(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT a.id, a.machine_id, m.asset_number, a.alert_type, a.severity, " +
            // occurred_at adicionado em 017; fallback para created_at (014) em rows antigas
            "a.status, a.message, COALESCE(a.occurred_at, a.created_at), a.acknowledged_at, a.acknowledged_by " +
            "FROM alert a " +
            "LEFT JOIN machine m ON m.id = a.machine_id " +
            "WHERE a.id = :id AND a.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (row == null) throw new NotFoundException("Alert not found: " + id);
        return mapRow(row);
    }

    @POST
    @Path("/{id}/acknowledge")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "TECHNICIAN"})
    public AlertResponse acknowledge(
        @PathParam("id") UUID id,
        AcknowledgeRequest req,
        @Context SecurityContext secCtx
    ) {
        UUID tenantId = TenantContext.getTenantId();
        String acknowledgedBy = secCtx != null && secCtx.getUserPrincipal() != null
            ? secCtx.getUserPrincipal().getName() : "unknown";

        int updated = em.createNativeQuery(
            "UPDATE alert SET status = 'ACKNOWLEDGED', " +
            "acknowledged_at = NOW(), acknowledged_by = :by, " +
            "note = :note, updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid AND status = 'OPEN'"
        )
            .setParameter("by", acknowledgedBy)
            .setParameter("note", req != null ? req.note() : null)
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Alert not found or not OPEN: " + id);

        audit.record("ALERT_ACKNOWLEDGED", "alert", id.toString(),
            JsonUtil.obj("acknowledgedBy", acknowledgedBy));

        return getAlert(id);
    }

    @GET
    @Path("/summary/open-count")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "TECHNICIAN", "FINANCE"})
    public Map<String, Object> openAlertSummary() {
        UUID tenantId = TenantContext.getTenantId();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT severity, COUNT(*) FROM alert " +
            "WHERE tenant_id = :tid AND status = 'OPEN' " +
            "GROUP BY severity"
        )
            .setParameter("tid", tenantId)
            .getResultList();

        var bySeverity = new java.util.LinkedHashMap<String, Long>();
        long total = 0;
        for (Object[] r : rows) {
            long count = ((Number) r[1]).longValue();
            bySeverity.put((String) r[0], count);
            total += count;
        }
        return Map.of("total", total, "bySeverity", bySeverity);
    }

    // ── Helper ──────────────────────────────────────────────────────────────────

    private AlertResponse mapRow(Object[] r) {
        return new AlertResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2], (String) r[3],
            (String) r[4], (String) r[5], (String) r[6],
            r[7] != null ? ((java.sql.Timestamp) r[7]).toInstant() : null,
            r[8] != null ? ((java.sql.Timestamp) r[8]).toInstant() : null,
            (String) r[9]
        );
    }
}
