package com.gruahub.finance.api;

import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.audit.application.AuditService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.jboss.logging.Logger;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST resource para liquidações financeiras e comissões.
 * As liquidações são calculadas pelo SettlementScheduler (job periódico)
 * ou criadas manualmente pelo FINANCE/TENANT_ADMIN.
 */
@Path("/api/v1/finance")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class FinanceResource {

    private static final Logger LOG = Logger.getLogger(FinanceResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public record SettlementResponse(
        UUID id,
        UUID operatingPointId,
        String operatingPointName,
        String periodStart,
        String periodEnd,
        String status,
        long grossRevenueCents,
        BigDecimal commissionPct,
        long commissionCents,
        long netRevenueCents,
        Instant createdAt
    ) {}

    public record CashCollectionRequest(
        @NotNull UUID clientOperationId,
        @NotNull UUID visitId,
        @NotNull UUID machineId,
        @Min(1) long amountCents,
        String notes
    ) {}

    // ── Settlements ───────────────────────────────────────────────────────────────

    @GET
    @Path("/settlements")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public List<SettlementResponse> listSettlements(
        @QueryParam("status") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        StringBuilder sql = new StringBuilder(
            "SELECT s.id, s.operating_point_id, op.name, " +
            "s.period_start, s.period_end, s.status, " +
            "s.gross_revenue_cents, " +
            // commission_pct adicionado em 017; fallback calculado se NULL
            "COALESCE(s.commission_pct, ROUND(s.commission_cents::numeric * 100 / NULLIF(s.gross_revenue_cents, 0), 2)), " +
            "s.commission_cents, " +
            // net_revenue_cents adicionado em 017; fallback net_amount_cents (coluna original)
            "COALESCE(s.net_revenue_cents, s.net_amount_cents), " +
            "s.created_at " +
            "FROM settlement s " +
            "JOIN operating_point op ON op.id = s.operating_point_id " +
            "WHERE s.tenant_id = :tid "
        );
        if (status != null) sql.append("AND s.status = :status ");
        sql.append("ORDER BY s.period_start DESC LIMIT :lim OFFSET :off");

        var q = em.createNativeQuery(sql.toString())
            .setParameter("tid", tenantId)
            .setParameter("lim", Math.min(size, 200))
            .setParameter("off", page * size);
        if (status != null) q.setParameter("status", status);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return rows.stream().map(this::mapSettlementRow).toList();
    }

    @PUT
    @Path("/settlements/{id}/approve")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public SettlementResponse approveSettlement(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        int updated = em.createNativeQuery(
            // Aceita DRAFT (default da migração) e PENDING (criado pelo scheduler)
            "UPDATE settlement SET status = 'APPROVED', updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid AND status IN ('PENDING', 'DRAFT')"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Settlement not found or not PENDING: " + id);
        audit.record("SETTLEMENT_APPROVED", "settlement", id.toString(), "{}");
        return getSettlement(id, tenantId);
    }

    @PUT
    @Path("/settlements/{id}/mark-paid")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public SettlementResponse markPaid(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        int updated = em.createNativeQuery(
            "UPDATE settlement SET status = 'PAID', paid_at = NOW(), updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid AND status = 'APPROVED'"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Settlement not found or not APPROVED: " + id);
        audit.record("SETTLEMENT_PAID", "settlement", id.toString(), "{}");
        return getSettlement(id, tenantId);
    }

    // ── Cash Collections (sangrias) ────────────────────────────────────────────────

    @POST
    @Path("/cash-collections")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public Response recordCashCollection(
        @Valid CashCollectionRequest req,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();

        // Idempotência offline-first
        Long existing = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM cash_collection " +
            "WHERE client_operation_id = :coid AND tenant_id = :tid"
        )
            .setParameter("coid", req.clientOperationId().toString())
            .setParameter("tid", tenantId)
            .getSingleResult();

        if (existing > 0) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Cash collection already recorded"))
                .build();
        }

        UUID id = UUID.randomUUID();
        em.createNativeQuery(
            "INSERT INTO cash_collection " +
            "(id, tenant_id, field_visit_id, machine_id, amount_cents, " +
            " payment_method, client_operation_id, occurred_at) " +
            "VALUES (:id, :tid, :vid, :mid, :amount, 'CASH', :coid, NOW())"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("vid", req.visitId())
            .setParameter("mid", req.machineId())
            .setParameter("amount", req.amountCents())
            .setParameter("coid", req.clientOperationId().toString())
            .executeUpdate();

        audit.record("CASH_COLLECTION_RECORDED", "cash_collection", id.toString(),
            JsonUtil.obj("amountCents", String.valueOf(req.amountCents())));

        URI location = uriInfo.getBaseUriBuilder()
            .path("/api/v1/finance/cash-collections/{id}").build(id);
        return Response.created(location).entity(Map.of("id", id)).build();
    }

    // ── Helper ──────────────────────────────────────────────────────────────────

    private SettlementResponse getSettlement(UUID id, UUID tenantId) {
        Object[] r = (Object[]) em.createNativeQuery(
            "SELECT s.id, s.operating_point_id, op.name, " +
            "s.period_start, s.period_end, s.status, " +
            "s.gross_revenue_cents, " +
            "COALESCE(s.commission_pct, ROUND(s.commission_cents::numeric * 100 / NULLIF(s.gross_revenue_cents, 0), 2)), " +
            "s.commission_cents, " +
            "COALESCE(s.net_revenue_cents, s.net_amount_cents), " +
            "s.created_at " +
            "FROM settlement s " +
            "JOIN operating_point op ON op.id = s.operating_point_id " +
            "WHERE s.id = :id AND s.tenant_id = :tid"
        ).setParameter("id", id).setParameter("tid", tenantId).getSingleResultOrNull();
        if (r == null) throw new NotFoundException("Settlement not found: " + id);
        return mapSettlementRow(r);
    }

    private SettlementResponse mapSettlementRow(Object[] r) {
        return new SettlementResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2],
            r[3] != null ? r[3].toString() : null,
            r[4] != null ? r[4].toString() : null,
            (String) r[5],
            r[6] != null ? ((Number) r[6]).longValue() : 0L,
            (BigDecimal) r[7],
            r[8] != null ? ((Number) r[8]).longValue() : 0L,
            r[9] != null ? ((Number) r[9]).longValue() : 0L,
            r[10] != null ? ((java.sql.Timestamp) r[10]).toInstant() : null
        );
    }
}
