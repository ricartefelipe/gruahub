package com.gruahub.plays.api;

import com.gruahub.audit.application.AuditService;
import com.gruahub.plays.application.CreditService;
import com.gruahub.shared.api.PageResponse;
import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.domain.NativeQueryValues;
import com.gruahub.shared.domain.TenantContext;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.SecurityContext;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/v1/plays")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class PlayResource {

    @Inject
    EntityManager em;

    @Inject
    CreditService creditService;

    @Inject
    AuditService audit;

    public record PlayResponse(
        UUID id,
        UUID machineId,
        String status,
        String outcome,
        long amountPaidCents,
        Instant occurredAt
    ) {}

    public record ManualCreditRequest(
        @NotNull UUID machineId,
        @Min(1) int playsGranted,
        @Min(0) long amountCents,
        @NotBlank @Size(max = 500) String justification
    ) {}

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FIELD_OPERATOR",
                   "TECHNICIAN", "FINANCE"})
    public PageResponse<PlayResponse> listPlays(
        @QueryParam("machineId") UUID machineId,
        @QueryParam("status") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE ps.tenant_id = :tid ");
        if (machineId != null) where.append("AND ps.machine_id = :mid ");
        if (status != null) where.append("AND ps.status = :status ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM play_session ps " + where
        ).setParameter("tid", tenantId);
        if (machineId != null) countQuery.setParameter("mid", machineId);
        if (status != null) countQuery.setParameter("status", status);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT ps.id, ps.machine_id, ps.status, ps.prize_delivered, " +
            "COALESCE(cg.amount_cents, 0), " +
            "COALESCE(ps.completed_at, ps.started_at) " +
            "FROM play_session ps " +
            "LEFT JOIN credit_grant cg ON cg.id = ps.credit_grant_id " +
            where +
            "ORDER BY COALESCE(ps.completed_at, ps.started_at) DESC NULLS LAST " +
            "LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (machineId != null) q.setParameter("mid", machineId);
        if (status != null) q.setParameter("status", status);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapRow).toList(), page, lim, total);
    }

    @POST
    @Path("/manual-credit")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER"})
    public Response grantManualCredit(
        @Valid ManualCreditRequest req,
        @Context SecurityContext secCtx
    ) {
        UUID tenantId = TenantContext.getTenantId();
        String authorizedBy = secCtx != null && secCtx.getUserPrincipal() != null
            ? secCtx.getUserPrincipal().getName() : "unknown";

        Long machineCount = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM machine WHERE id = :mid AND tenant_id = :tid"
        )
            .setParameter("mid", req.machineId())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();
        if (machineCount == 0) {
            throw new BadRequestException("Machine not found in tenant");
        }

        UUID creditId = creditService.grantCreditManual(
            tenantId,
            req.machineId(),
            req.amountCents(),
            req.playsGranted(),
            req.justification(),
            authorizedBy
        );

        audit.record("MANUAL_CREDIT_GRANTED", "credit_grant", creditId.toString(),
            JsonUtil.obj(
                "machineId", req.machineId().toString(),
                "playsGranted", String.valueOf(req.playsGranted()),
                "authorizedBy", authorizedBy
            ));

        return Response.status(Response.Status.CREATED)
            .entity(Map.of(
                "id", creditId,
                "machineId", req.machineId(),
                "playsGranted", req.playsGranted(),
                "amountCents", req.amountCents(),
                "status", "PENDING"
            ))
            .build();
    }

    private PlayResponse mapRow(Object[] r) {
        boolean prizeDelivered = r[3] != null && (Boolean) r[3];
        String sessionStatus = (String) r[2];
        String outcome;
        if ("COMPLETED".equals(sessionStatus)) {
            outcome = prizeDelivered ? "WIN" : "LOSE";
        } else {
            outcome = "IN_PROGRESS";
        }
        Instant occurredAt = null;
        if (r[5] != null) {
            occurredAt = NativeQueryValues.toInstant(r[5]);
        }
        return new PlayResponse(
            (UUID) r[0],
            (UUID) r[1],
            sessionStatus,
            outcome,
            ((Number) r[4]).longValue(),
            occurredAt
        );
    }
}
