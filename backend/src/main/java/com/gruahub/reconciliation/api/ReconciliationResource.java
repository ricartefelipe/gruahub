package com.gruahub.reconciliation.api;

import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.audit.application.AuditService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST resource para consulta e resolução de casos de conciliação.
 * <p>
 * A criação de casos é feita pelo ReconciliationScheduler (job automático).
 * Esta resource expõe consulta e resolução manual para casos que não se resolvem
 * automaticamente.
 */
@Path("/api/v1/reconciliation")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class ReconciliationResource {

    private static final Logger LOG = Logger.getLogger(ReconciliationResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public record ReconciliationCaseResponse(
        UUID id,
        UUID paymentTransactionId,
        UUID creditGrantId,
        UUID playSessionId,
        String status,
        String statusReason,
        Instant createdAt,
        Instant updatedAt,
        Instant resolvedAt,
        String resolvedBy
    ) {}

    public record ManualResolveRequest(
        @NotBlank String resolution,
        String note
    ) {}

    // ── Queries ─────────────────────────────────────────────────────────────────

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public List<ReconciliationCaseResponse> listCases(
        @QueryParam("status") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        LOG.debugf("[%s] GET /reconciliation status=%s", tenantId, status);

        StringBuilder sql = new StringBuilder(
            "SELECT id, payment_transaction_id, credit_grant_id, play_session_id, " +
            "status, status_reason, created_at, updated_at, resolved_at, resolved_by " +
            "FROM reconciliation_case WHERE tenant_id = :tid "
        );
        if (status != null) sql.append("AND status = :status ");
        sql.append("ORDER BY created_at DESC LIMIT :lim OFFSET :off");

        var query = em.createNativeQuery(sql.toString())
            .setParameter("tid", tenantId)
            .setParameter("lim", Math.min(size, 200))
            .setParameter("off", page * size);

        if (status != null) query.setParameter("status", status);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        return rows.stream().map(this::mapRow).toList();
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public ReconciliationCaseResponse getCase(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT id, payment_transaction_id, credit_grant_id, play_session_id, " +
            "status, status_reason, created_at, updated_at, resolved_at, resolved_by " +
            "FROM reconciliation_case WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .getSingleResultOrNull();
        if (row == null) throw new NotFoundException("Reconciliation case not found: " + id);
        return mapRow(row);
    }

    @POST
    @Path("/{id}/resolve")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public ReconciliationCaseResponse resolveManually(
        @PathParam("id") UUID id,
        ManualResolveRequest req
    ) {
        UUID tenantId = TenantContext.getTenantId();
        var secCtx = jakarta.enterprise.inject.spi.CDI.current()
            .select(jakarta.ws.rs.core.SecurityContext.class).get();
        String resolvedBy = secCtx != null && secCtx.getUserPrincipal() != null
            ? secCtx.getUserPrincipal().getName() : "unknown";

        int updated = em.createNativeQuery(
            "UPDATE reconciliation_case SET status = :res, " +
            "status_reason = :note, resolved_at = NOW(), resolved_by = :by, " +
            "updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid AND status NOT IN ('MATCHED','MANUALLY_RESOLVED')"
        )
            .setParameter("res", req.resolution())
            .setParameter("note", req.note())
            .setParameter("by", resolvedBy)
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException(
            "Case not found or already resolved: " + id);

        audit.record("RECONCILIATION_MANUALLY_RESOLVED", "reconciliation_case",
            id.toString(), JsonUtil.obj("resolvedBy", resolvedBy, "resolution", req.resolution()));

        return getCase(id);
    }

    @GET
    @Path("/summary")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public Map<String, Object> summary() {
        UUID tenantId = TenantContext.getTenantId();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT status, COUNT(*) FROM reconciliation_case " +
            "WHERE tenant_id = :tid GROUP BY status ORDER BY status"
        )
            .setParameter("tid", tenantId)
            .getResultList();

        var byStatus = new java.util.LinkedHashMap<String, Long>();
        long totalPending = 0;
        for (Object[] r : rows) {
            String s = (String) r[0];
            long count = ((Number) r[1]).longValue();
            byStatus.put(s, count);
            if (!"MATCHED".equals(s) && !"MANUALLY_RESOLVED".equals(s)) {
                totalPending += count;
            }
        }
        return Map.of("byStatus", byStatus, "totalPending", totalPending);
    }

    // ── Helper ──────────────────────────────────────────────────────────────────

    private ReconciliationCaseResponse mapRow(Object[] r) {
        return new ReconciliationCaseResponse(
            (UUID) r[0], (UUID) r[1], (UUID) r[2], (UUID) r[3],
            (String) r[4], (String) r[5],
            r[6] != null ? ((java.sql.Timestamp) r[6]).toInstant() : null,
            r[7] != null ? ((java.sql.Timestamp) r[7]).toInstant() : null,
            r[8] != null ? ((java.sql.Timestamp) r[8]).toInstant() : null,
            (String) r[9]
        );
    }
}
