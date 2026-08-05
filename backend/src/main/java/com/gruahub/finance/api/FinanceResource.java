package com.gruahub.finance.api;

import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.api.PageResponse;
import com.gruahub.shared.domain.NativeQueryValues;
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

    public record CommissionPolicyRequest(
        @NotNull UUID operatingPointId,
        @NotBlank String policyType,
        BigDecimal percentage,
        Long fixedAmountCents,
        @NotBlank String effectiveFrom,
        String effectiveTo
    ) {}

    public record CommissionPolicyResponse(
        UUID id,
        UUID operatingPointId,
        String operatingPointName,
        String policyType,
        BigDecimal percentage,
        Long fixedAmountCents,
        String effectiveFrom,
        String effectiveTo,
        int versionNumber
    ) {}


    @GET
    @Path("/settlements")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public PageResponse<SettlementResponse> listSettlements(
        @QueryParam("status") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE s.tenant_id = :tid ");
        if (status != null) where.append("AND s.status = :status ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM settlement s " + where
        ).setParameter("tid", tenantId);
        if (status != null) countQuery.setParameter("status", status);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT s.id, s.operating_point_id, op.name, " +
            "s.period_start, s.period_end, s.status, " +
            "s.gross_revenue_cents, " +
            "COALESCE(s.commission_pct, ROUND(s.commission_cents::numeric * 100 / NULLIF(s.gross_revenue_cents, 0), 2)), " +
            "s.commission_cents, " +
            "COALESCE(s.net_revenue_cents, s.net_amount_cents), " +
            "s.created_at " +
            "FROM settlement s " +
            "JOIN operating_point op ON op.id = s.operating_point_id " +
            where +
            "ORDER BY s.period_start DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (status != null) q.setParameter("status", status);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapSettlementRow).toList(), page, lim, total);
    }

    @PUT
    @Path("/settlements/{id}/approve")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public SettlementResponse approveSettlement(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        int updated = em.createNativeQuery(
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

    @GET
    @Path("/commission-policies")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public PageResponse<CommissionPolicyResponse> listCommissionPolicies(
        @QueryParam("operatingPointId") UUID operatingPointId,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE cp.tenant_id = :tid ");
        if (operatingPointId != null) where.append("AND cp.operating_point_id = :opid ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM commission_policy cp " + where
        ).setParameter("tid", tenantId);
        if (operatingPointId != null) countQuery.setParameter("opid", operatingPointId);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT cp.id, cp.operating_point_id, op.name, cp.policy_type, cp.percentage, " +
            "cp.fixed_amount_cents, cp.effective_from, cp.effective_to, cp.version_number " +
            "FROM commission_policy cp " +
            "JOIN operating_point op ON op.id = cp.operating_point_id " +
            where +
            "ORDER BY cp.effective_from DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (operatingPointId != null) q.setParameter("opid", operatingPointId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapPolicyRow).toList(), page, lim, total);
    }

    @POST
    @Path("/commission-policies")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public Response createCommissionPolicy(
        @Valid CommissionPolicyRequest req,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();

        Long pointCount = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM operating_point WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("id", req.operatingPointId())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();
        if (pointCount == 0) throw new BadRequestException("Operating point not found in tenant");

        if ("PERCENTAGE".equals(req.policyType()) && req.percentage() == null) {
            throw new BadRequestException("percentage is required for PERCENTAGE policy");
        }
        if ("FIXED".equals(req.policyType()) && req.fixedAmountCents() == null) {
            throw new BadRequestException("fixedAmountCents is required for FIXED policy");
        }

        Number version = (Number) em.createNativeQuery(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM commission_policy " +
            "WHERE tenant_id = :tid AND operating_point_id = :opid"
        )
            .setParameter("tid", tenantId)
            .setParameter("opid", req.operatingPointId())
            .getSingleResult();

        UUID id = UUID.randomUUID();
        java.sql.Date effectiveFrom = java.sql.Date.valueOf(req.effectiveFrom());
        java.sql.Date effectiveTo = req.effectiveTo() != null && !req.effectiveTo().isBlank()
            ? java.sql.Date.valueOf(req.effectiveTo()) : null;

        em.createNativeQuery(
            "INSERT INTO commission_policy " +
            "(id, tenant_id, operating_point_id, policy_type, percentage, fixed_amount_cents, " +
            " effective_from, effective_to, version_number, created_at) " +
            "VALUES (:id, :tid, :opid, :ptype, :pct, :fixed, :ef, :et, :ver, NOW())"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("opid", req.operatingPointId())
            .setParameter("ptype", req.policyType())
            .setParameter("pct", req.percentage())
            .setParameter("fixed", req.fixedAmountCents())
            .setParameter("ef", effectiveFrom)
            .setParameter("et", effectiveTo)
            .setParameter("ver", version.intValue())
            .executeUpdate();

        audit.record("COMMISSION_POLICY_CREATED", "commission_policy", id.toString(),
            JsonUtil.obj("operatingPointId", req.operatingPointId().toString(),
                         "policyType", req.policyType()));

        URI location = uriInfo.getBaseUriBuilder()
            .path("/api/v1/finance/commission-policies/{id}").build(id);
        return Response.created(location).entity(getPolicy(id, tenantId)).build();
    }


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
        ).setParameter("id", id).setParameter("tid", tenantId).unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
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
            r[7] != null ? (BigDecimal) r[7] : null,
            r[8] != null ? ((Number) r[8]).longValue() : 0L,
            r[9] != null ? ((Number) r[9]).longValue() : 0L,
            r[10] != null ? NativeQueryValues.toInstant(r[10]) : null
        );
    }

    private CommissionPolicyResponse getPolicy(UUID id, UUID tenantId) {
        Object[] r = (Object[]) em.createNativeQuery(
            "SELECT cp.id, cp.operating_point_id, op.name, cp.policy_type, cp.percentage, " +
            "cp.fixed_amount_cents, cp.effective_from, cp.effective_to, cp.version_number " +
            "FROM commission_policy cp " +
            "JOIN operating_point op ON op.id = cp.operating_point_id " +
            "WHERE cp.id = :id AND cp.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (r == null) throw new NotFoundException("Commission policy not found: " + id);
        return mapPolicyRow(r);
    }

    private CommissionPolicyResponse mapPolicyRow(Object[] r) {
        return new CommissionPolicyResponse(
            (UUID) r[0],
            (UUID) r[1],
            (String) r[2],
            (String) r[3],
            r[4] != null ? (BigDecimal) r[4] : null,
            r[5] != null ? ((Number) r[5]).longValue() : null,
            r[6] != null ? r[6].toString() : null,
            r[7] != null ? r[7].toString() : null,
            r[8] != null ? ((Number) r[8]).intValue() : 1
        );
    }
}
