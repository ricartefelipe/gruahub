package com.gruahub.fieldops.api;

import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.api.PageResponse;
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

import java.net.URI;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Idempotente via client_operation_id (409 se já processado). */
@Path("/api/v1/visits")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class FieldVisitResource {

    private static final Logger LOG = Logger.getLogger(FieldVisitResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;


    public record StartVisitRequest(
        @NotNull UUID visitId,
        @NotNull UUID clientOperationId,
        @NotNull UUID operatingPointId,
        @NotBlank String responsibleName,
        String notes,
        String checkinAt,
        Double checkinLatitude,
        Double checkinLongitude
    ) {}

    public record CompleteVisitRequest(
        @NotNull UUID visitId,
        @NotNull UUID clientOperationId,
        String checkoutAt,
        Long cashCollectedCents
    ) {}

    public record ChecklistRequest(
        @NotNull UUID visitId,
        @NotNull UUID clientOperationId,
        List<ChecklistItem> items,
        String completedAt
    ) {}

    public record ChecklistItem(String key, boolean checked) implements JsonUtil.ChecklistEntry {}

    public record VisitResponse(
        UUID id,
        UUID operatingPointId,
        String operatingPointName,
        String status,
        String responsibleName,
        Instant checkinAt,
        Instant checkoutAt,
        Long cashCollectedCents,
        Instant createdAt
    ) {}


    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public PageResponse<VisitResponse> listVisits(
        @QueryParam("operatingPointId") UUID pointId,
        @QueryParam("status") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE v.tenant_id = :tid ");
        if (pointId != null) where.append("AND v.operating_point_id = :pid ");
        if (status != null) where.append("AND v.status = :status ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM field_visit v " + where
        ).setParameter("tid", tenantId);
        if (pointId != null) countQuery.setParameter("pid", pointId);
        if (status != null) countQuery.setParameter("status", status);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT v.id, v.operating_point_id, op.name, v.status, v.responsible_name, " +
            "v.checkin_at, v.checkout_at, v.cash_collected_cents, v.created_at " +
            "FROM field_visit v " +
            "JOIN operating_point op ON op.id = v.operating_point_id " +
            where +
            "ORDER BY v.checkin_at DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (pointId != null) q.setParameter("pid", pointId);
        if (status != null) q.setParameter("status", status);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapVisitRow).toList(), page, lim, total);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public VisitResponse getVisit(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT v.id, v.operating_point_id, op.name, v.status, v.responsible_name, " +
            "v.checkin_at, v.checkout_at, v.cash_collected_cents, v.created_at " +
            "FROM field_visit v " +
            "JOIN operating_point op ON op.id = v.operating_point_id " +
            "WHERE v.id = :id AND v.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (row == null) throw new NotFoundException("Visit not found: " + id);
        return mapVisitRow(row);
    }


    @POST
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR"})
    public Response startVisit(
        @Valid StartVisitRequest req,
        @HeaderParam("Idempotency-Key") String idempotencyKey,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();
        UUID clientOpId = req.clientOperationId();

        Long existing = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM field_visit WHERE client_operation_id = :coid AND tenant_id = :tid"
        )
            .setParameter("coid", clientOpId.toString())
            .setParameter("tid", tenantId)
            .getSingleResult();

        if (existing > 0) {
            LOG.infof("[%s] Duplicate visit start ignored: clientOpId=%s", tenantId, clientOpId);
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Operation already processed", "clientOperationId", clientOpId))
                .build();
        }

        UUID visitId = req.visitId();

        em.createNativeQuery(
            "INSERT INTO field_visit " +
            "(id, tenant_id, client_operation_id, operating_point_id, status, " +
            " responsible_name, notes, checkin_at, checkin_latitude, checkin_longitude) " +
            "VALUES (:id, :tid, :coid, :pid, 'IN_PROGRESS', :name, :notes, " +
            " COALESCE(CAST(:checkinAt AS timestamptz), NOW()), :lat, :lng)"
        )
            .setParameter("id", visitId)
            .setParameter("tid", tenantId)
            .setParameter("coid", clientOpId.toString())
            .setParameter("pid", req.operatingPointId())
            .setParameter("name", req.responsibleName())
            .setParameter("notes", req.notes())
            .setParameter("checkinAt", req.checkinAt())
            .setParameter("lat", req.checkinLatitude())
            .setParameter("lng", req.checkinLongitude())
            .executeUpdate();

        audit.record("FIELD_VISIT_STARTED", "field_visit", visitId.toString(),
            JsonUtil.obj("operatingPointId", req.operatingPointId().toString()));

        URI location = uriInfo.getAbsolutePathBuilder().path(visitId.toString()).build();
        return Response.created(location).entity(Map.of("id", visitId)).build();
    }

    @POST
    @Path("/complete")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR"})
    public Response completeVisit(@Valid CompleteVisitRequest req) {
        UUID tenantId = TenantContext.getTenantId();
        UUID clientOpId = req.clientOperationId();

        Object[] existing = (Object[]) em.createNativeQuery(
            "SELECT id, status FROM field_visit WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("id", req.visitId())
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        if (existing == null) throw new NotFoundException("Visit not found: " + req.visitId());
        if ("COMPLETED".equals(existing[1])) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Visit already completed"))
                .build();
        }

        em.createNativeQuery(
            "UPDATE field_visit SET status = 'COMPLETED', " +
            "checkout_at = COALESCE(CAST(:co AS timestamptz), NOW()), " +
            "cash_collected_cents = :cash, updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("co", req.checkoutAt())
            .setParameter("cash", req.cashCollectedCents())
            .setParameter("id", req.visitId())
            .setParameter("tid", tenantId)
            .executeUpdate();

        audit.record("FIELD_VISIT_COMPLETED", "field_visit", req.visitId().toString(),
            JsonUtil.obj("cashCollectedCents",
                req.cashCollectedCents() != null ? String.valueOf(req.cashCollectedCents()) : "0"));

        return Response.ok(Map.of("id", req.visitId(), "status", "COMPLETED")).build();
    }

    @POST
    @Path("/checklist")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR"})
    public Response saveChecklist(@Valid ChecklistRequest req) {
        UUID tenantId = TenantContext.getTenantId();
        UUID clientOpId = req.clientOperationId();

        Long count = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM visit_checklist_result " +
            "WHERE client_operation_id = :coid AND tenant_id = :tid"
        )
            .setParameter("coid", clientOpId.toString())
            .setParameter("tid", tenantId)
            .getSingleResult();

        if (count > 0) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Checklist already submitted"))
                .build();
        }

        UUID resultId = UUID.randomUUID();
        String itemsJson = JsonUtil.checklistArray(req.items());

        em.createNativeQuery(
            "INSERT INTO visit_checklist_result " +
            "(id, tenant_id, visit_id, client_operation_id, items, completed_at) " +
            "VALUES (:id, :tid, :vid, :coid, CAST(:items AS jsonb), " +
            "COALESCE(CAST(:completedAt AS timestamptz), NOW()))"
        )
            .setParameter("id", resultId)
            .setParameter("tid", tenantId)
            .setParameter("vid", req.visitId())
            .setParameter("coid", clientOpId.toString())
            .setParameter("items", itemsJson)
            .setParameter("completedAt", req.completedAt())
            .executeUpdate();

        return Response.ok(Map.of("id", resultId)).build();
    }


    private VisitResponse mapVisitRow(Object[] r) {
        return new VisitResponse(
            toUuid(r[0]), toUuid(r[1]), (String) r[2], (String) r[3], (String) r[4],
            toInstant(r[5]),
            toInstant(r[6]),
            r[7] != null ? ((Number) r[7]).longValue() : null,
            toInstant(r[8])
        );
    }

    private static UUID toUuid(Object value) {
        if (value == null) return null;
        if (value instanceof UUID uuid) return uuid;
        return UUID.fromString(value.toString());
    }

    private static Instant toInstant(Object value) {
        if (value == null) return null;
        if (value instanceof Instant instant) return instant;
        if (value instanceof java.sql.Timestamp ts) return ts.toInstant();
        if (value instanceof java.util.Date date) return date.toInstant();
        if (value instanceof OffsetDateTime odt) return odt.toInstant();
        throw new IllegalArgumentException("Unsupported temporal type: " + value.getClass());
    }
}
