package com.gruahub.routing.api;

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
import jakarta.ws.rs.core.*;
import org.jboss.logging.Logger;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/v1/routes")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class RoutingResource {

    private static final Logger LOG = Logger.getLogger(RoutingResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public record RoutePlanResponse(
        UUID id,
        String operatorUserId,
        String plannedDate,
        String status,
        int totalStops,
        int completedStops,
        String createdAt
    ) {}

    public record RouteStopResponse(
        UUID id,
        UUID routePlanId,
        UUID operatingPointId,
        String operatingPointName,
        String address,
        int stopOrder,
        int priorityScore,
        String priorityExplanation,
        String status,
        Double latitude,
        Double longitude
    ) {}

    // ── Plans ─────────────────────────────────────────────────────────────────────

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public PageResponse<RoutePlanResponse> listPlans(
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("30") int size,
        @QueryParam("date") String date
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 100);
        LocalDate filterDate = (date != null && !date.isBlank()) ? LocalDate.parse(date) : null;
        String dateClause = filterDate != null
            ? " AND COALESCE(rp.planned_date, rp.scheduled_date) = CAST(:date AS date) "
            : "";

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM route_plan rp WHERE rp.tenant_id = :tid" + dateClause
        ).setParameter("tid", tenantId);
        if (filterDate != null) {
            countQuery.setParameter("date", filterDate.toString());
        }
        long total = ((Number) countQuery.getSingleResult()).longValue();

        var listQuery = em.createNativeQuery(
            "SELECT rp.id, rp.operator_user_id, " +
            "COALESCE(rp.planned_date, rp.scheduled_date), " +
            "rp.status, " +
            "COUNT(rs.id) as total, " +
            "COUNT(rs.id) FILTER (WHERE rs.status = 'COMPLETED') as completed, " +
            "rp.created_at " +
            "FROM route_plan rp " +
            "LEFT JOIN route_stop rs ON rs.route_plan_id = rp.id " +
            "WHERE rp.tenant_id = :tid " + dateClause +
            "GROUP BY rp.id, rp.operator_user_id, rp.planned_date, rp.scheduled_date, " +
            "rp.status, rp.created_at " +
            "ORDER BY COALESCE(rp.planned_date, rp.scheduled_date) DESC " +
            "LIMIT :lim OFFSET :off"
        )
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (filterDate != null) {
            listQuery.setParameter("date", filterDate.toString());
        }

        @SuppressWarnings("unchecked")
        List<Object[]> rows = listQuery.getResultList();

        var content = rows.stream().map(r -> new RoutePlanResponse(
            (UUID) r[0],
            r[1] != null ? r[1].toString() : null,
            r[2] != null ? r[2].toString() : null,
            (String) r[3],
            ((Number) r[4]).intValue(),
            ((Number) r[5]).intValue(),
            r[6] != null ? r[6].toString() : null
        )).toList();
        return PageResponse.of(content, page, lim, total);
    }

    @GET
    @Path("/{id}/stops")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public PageResponse<RouteStopResponse> listStops(@PathParam("id") UUID routePlanId) {
        UUID tenantId = TenantContext.getTenantId();

        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT rs.id, rs.route_plan_id, rs.operating_point_id, op.name, " +
            "CONCAT(op.address_street, ', ', op.address_city, '/', op.address_state), " +
            "COALESCE(rs.stop_order, rs.sequence_order), " +
            "rs.priority_score, rs.priority_explanation::text, rs.status, " +
            "op.latitude, op.longitude " +
            "FROM route_stop rs " +
            "JOIN operating_point op ON op.id = rs.operating_point_id " +
            "JOIN route_plan rp ON rp.id = rs.route_plan_id " +
            "WHERE rs.route_plan_id = :planId AND rp.tenant_id = :tid " +
            "ORDER BY COALESCE(rs.stop_order, rs.sequence_order) ASC"
        )
            .setParameter("planId", routePlanId)
            .setParameter("tid", tenantId)
            .getResultList();

        var content = rows.stream().map(r -> new RouteStopResponse(
            (UUID) r[0], (UUID) r[1], (UUID) r[2], (String) r[3], (String) r[4],
            ((Number) r[5]).intValue(),
            r[6] != null ? ((Number) r[6]).intValue() : 0,
            (String) r[7], (String) r[8],
            r[9] != null ? ((Number) r[9]).doubleValue() : null,
            r[10] != null ? ((Number) r[10]).doubleValue() : null
        )).toList();
        return PageResponse.of(content, 0, Math.max(content.size(), 1), content.size());
    }

    /**
     * Gera rota para hoje com base nos priority_scores dos pontos ativos.
     * MVP: ordena por priority_score DESC, limita aos top-N pontos do tenant.
     */
    @POST
    @Path("/generate")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public Response generateRoute(
        @QueryParam("maxStops") @DefaultValue("10") int maxStops,
        @Context SecurityContext secCtx,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();
        LocalDate today = LocalDate.now();
        UUID planId = UUID.randomUUID();

        // Obtém UUID do operador a partir do subject OIDC; gera aleatório se ausente
        UUID operatorId;
        try {
            String sub = secCtx.getUserPrincipal() != null
                ? secCtx.getUserPrincipal().getName() : null;
            operatorId = (sub != null) ? UUID.fromString(sub) : UUID.randomUUID();
        } catch (IllegalArgumentException e) {
            operatorId = UUID.randomUUID();
        }

        // Insere nas duas colunas de data: scheduled_date (NOT NULL, 012) e
        // planned_date (nullable alias, 017)
        em.createNativeQuery(
            "INSERT INTO route_plan " +
            "(id, tenant_id, operator_user_id, scheduled_date, planned_date, status) " +
            "VALUES (:id, :tid, :opId, :date, :date, 'PLANNED')"
        )
            .setParameter("id", planId)
            .setParameter("tid", tenantId)
            .setParameter("opId", operatorId)
            .setParameter("date", today.toString())
            .executeUpdate();

        // Busca pontos ordenados por priority_score
        @SuppressWarnings("unchecked")
        List<Object[]> points = em.createNativeQuery(
            "SELECT id, priority_score, " +
            "COALESCE(priority_explanation::text, 'Score automático') " +
            "FROM operating_point " +
            "WHERE tenant_id = :tid AND status = 'ACTIVE' " +
            "ORDER BY priority_score DESC NULLS LAST " +
            "LIMIT :max"
        )
            .setParameter("tid", tenantId)
            .setParameter("max", Math.min(maxStops, 50))
            .getResultList();

        for (int i = 0; i < points.size(); i++) {
            Object[] p = points.get(i);
            int order = i + 1;
            // Insere em sequence_order (NOT NULL, 012) e stop_order (alias, 017)
            em.createNativeQuery(
                "INSERT INTO route_stop " +
                "(id, route_plan_id, tenant_id, operating_point_id, " +
                " sequence_order, stop_order, " +
                " priority_score, priority_explanation, status) " +
                "VALUES (:id, :planId, :tid, :pointId, :order, :order, :score, :explain, 'PENDING')"
            )
                .setParameter("id", UUID.randomUUID())
                .setParameter("planId", planId)
                .setParameter("tid", tenantId)
                .setParameter("pointId", p[0])
                .setParameter("order", order)
                .setParameter("score", p[1])
                .setParameter("explain", p[2])
                .executeUpdate();
        }

        audit.record("ROUTE_GENERATED", "route_plan", planId.toString(),
            JsonUtil.obj("stops", String.valueOf(points.size()), "date", String.valueOf(today)));

        URI location = uriInfo.getAbsolutePathBuilder()
            .replacePath("/api/v1/routes/{id}/stops").build(planId);
        return Response.created(location)
            .entity(Map.of(
                "id", planId,
                "totalStops", points.size(),
                "plannedDate", today.toString()
            ))
            .build();
    }
}
