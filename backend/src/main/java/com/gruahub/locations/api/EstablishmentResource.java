package com.gruahub.locations.api;

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
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.core.Context;
import org.jboss.logging.Logger;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * REST resource para gerenciamento de Estabelecimentos (locations).
 * <p>
 * Invariante de tenant: todos os queries incluem tenantId extraído do JWT.
 */
@Path("/api/v1/establishments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class EstablishmentResource {

    private static final Logger LOG = Logger.getLogger(EstablishmentResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public record EstablishmentRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 40) String externalCode
    ) {}

    public record EstablishmentResponse(
        UUID id,
        String name,
        String externalCode,
        String status,
        Instant createdAt
    ) {}

    // ── Queries ─────────────────────────────────────────────────────────────────

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE", "TECHNICIAN"})
    public PageResponse<EstablishmentResponse> listEstablishments(
        @QueryParam("status") @DefaultValue("ACTIVE") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        LOG.debugf("[%s] GET /establishments status=%s page=%d", tenantId, status, page);

        int lim = Math.min(size, 200);
        long total = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM establishment WHERE tenant_id = :tid AND status = :status"
        )
            .setParameter("tid", tenantId)
            .setParameter("status", status)
            .getSingleResult()).longValue();

        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT id, name, external_code, status, created_at " +
            "FROM establishment WHERE tenant_id = :tid AND status = :status " +
            "ORDER BY name LIMIT :lim OFFSET :off"
        )
            .setParameter("tid", tenantId)
            .setParameter("status", status)
            .setParameter("lim", lim)
            .setParameter("off", page * lim)
            .getResultList();

        var content = rows.stream().map(r -> new EstablishmentResponse(
            (UUID) r[0], (String) r[1], (String) r[2], (String) r[3],
            r[4] != null ? ((java.sql.Timestamp) r[4]).toInstant() : null
        )).toList();
        return PageResponse.of(content, page, lim, total);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE",
                   "TECHNICIAN", "ESTABLISHMENT_VIEWER"})
    public EstablishmentResponse getEstablishment(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT id, name, external_code, status, created_at " +
            "FROM establishment WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        if (row == null) throw new NotFoundException("Establishment not found: " + id);

        return new EstablishmentResponse(
            (UUID) row[0], (String) row[1], (String) row[2], (String) row[3],
            row[4] != null ? ((java.sql.Timestamp) row[4]).toInstant() : null
        );
    }

    @POST
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public Response createEstablishment(
        @Valid EstablishmentRequest req,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();
        UUID id = UUID.randomUUID();

        em.createNativeQuery(
            "INSERT INTO establishment (id, tenant_id, name, external_code, status) " +
            "VALUES (:id, :tid, :name, :code, 'ACTIVE')"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("name", req.name())
            .setParameter("code", req.externalCode())
            .executeUpdate();

        audit.record("ESTABLISHMENT_CREATED", "establishment", id.toString(),
            JsonUtil.obj("name", req.name()));

        URI location = uriInfo.getAbsolutePathBuilder().path(id.toString()).build();
        return Response.created(location).entity(java.util.Map.of("id", id)).build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public EstablishmentResponse updateEstablishment(
        @PathParam("id") UUID id,
        @Valid EstablishmentRequest req
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int updated = em.createNativeQuery(
            "UPDATE establishment SET name = :name, external_code = :code, updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("name", req.name())
            .setParameter("code", req.externalCode())
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Establishment not found: " + id);

        audit.record("ESTABLISHMENT_UPDATED", "establishment", id.toString(),
            JsonUtil.obj("name", req.name()));

        return getEstablishment(id);
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public Response deactivateEstablishment(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        int updated = em.createNativeQuery(
            "UPDATE establishment SET status = 'INACTIVE', updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid AND status != 'INACTIVE'"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Establishment not found or already inactive: " + id);

        audit.record("ESTABLISHMENT_DEACTIVATED", "establishment", id.toString(), "{}");
        return Response.noContent().build();
    }
}
