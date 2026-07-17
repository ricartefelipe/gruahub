package com.gruahub.locations.api;

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

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST resource para Pontos de Operação (operating_point).
 * Um ponto é a localização física dentro de um estabelecimento onde
 * uma ou mais máquinas são instaladas.
 */
@Path("/api/v1/operating-points")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class OperatingPointResource {

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public record OperatingPointRequest(
        @NotNull UUID establishmentId,
        @NotBlank @Size(max = 120) String name,
        @Size(max = 200) String addressStreet,
        @Size(max = 80)  String addressCity,
        @Size(max = 2)   String addressState,
        @Size(max = 9)   String addressZip,
        Double latitude,
        Double longitude,
        @DecimalMin("0") @DecimalMax("100") java.math.BigDecimal commissionPct,
        @Size(max = 30)  String contractType
    ) {}

    public record OperatingPointResponse(
        UUID id,
        UUID establishmentId,
        String establishmentName,
        String name,
        String addressStreet,
        String addressCity,
        String addressState,
        Double latitude,
        Double longitude,
        java.math.BigDecimal commissionPct,
        String contractType,
        String status,
        Integer priorityScore
    ) {}

    // ── List ─────────────────────────────────────────────────────────────────────

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE",
                   "TECHNICIAN", "ESTABLISHMENT_VIEWER"})
    public List<OperatingPointResponse> listPoints(
        @QueryParam("establishmentId") UUID establishmentId,
        @QueryParam("status") @DefaultValue("ACTIVE") String status,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();

        String sql = "SELECT op.id, op.establishment_id, e.name as est_name, " +
            "op.name, op.address_street, op.address_city, op.address_state, " +
            "op.latitude, op.longitude, op.commission_pct, op.contract_type, " +
            "op.status, op.priority_score " +
            "FROM operating_point op " +
            "JOIN establishment e ON e.id = op.establishment_id " +
            "WHERE op.tenant_id = :tid AND op.status = :status " +
            (establishmentId != null ? "AND op.establishment_id = :eid " : "") +
            "ORDER BY op.priority_score DESC NULLS LAST, op.name " +
            "LIMIT :lim OFFSET :off";

        var query = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("status", status)
            .setParameter("lim", Math.min(size, 200))
            .setParameter("off", page * size);

        if (establishmentId != null) query.setParameter("eid", establishmentId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = query.getResultList();
        return rows.stream().map(this::mapRow).toList();
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE",
                   "TECHNICIAN", "ESTABLISHMENT_VIEWER"})
    public OperatingPointResponse getPoint(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT op.id, op.establishment_id, e.name, " +
            "op.name, op.address_street, op.address_city, op.address_state, " +
            "op.latitude, op.longitude, op.commission_pct, op.contract_type, " +
            "op.status, op.priority_score " +
            "FROM operating_point op " +
            "JOIN establishment e ON e.id = op.establishment_id " +
            "WHERE op.id = :id AND op.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .getSingleResultOrNull();
        if (row == null) throw new NotFoundException("Operating point not found: " + id);
        return mapRow(row);
    }

    @POST
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public Response createPoint(
        @Valid OperatingPointRequest req,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();
        UUID id = UUID.randomUUID();

        // Valida que o establishment pertence ao tenant
        long estCount = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM establishment WHERE id = :eid AND tenant_id = :tid"
        )
            .setParameter("eid", req.establishmentId())
            .setParameter("tid", tenantId)
            .getSingleResult();
        if (estCount == 0) throw new BadRequestException("Establishment not found in tenant");

        em.createNativeQuery(
            "INSERT INTO operating_point " +
            "(id, tenant_id, establishment_id, name, address_street, address_city, address_state, " +
            " address_zip, latitude, longitude, commission_pct, contract_type, status) " +
            "VALUES (:id, :tid, :eid, :name, :street, :city, :state, :zip, :lat, :lng, :comm, :ct, 'ACTIVE')"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("eid", req.establishmentId())
            .setParameter("name", req.name())
            .setParameter("street", req.addressStreet())
            .setParameter("city", req.addressCity())
            .setParameter("state", req.addressState())
            .setParameter("zip", req.addressZip())
            .setParameter("lat", req.latitude())
            .setParameter("lng", req.longitude())
            .setParameter("comm", req.commissionPct())
            .setParameter("ct", req.contractType())
            .executeUpdate();

        audit.record("OPERATING_POINT_CREATED", "operating_point", id.toString(),
            JsonUtil.obj("name", req.name(), "establishmentId", req.establishmentId() != null ? req.establishmentId().toString() : null));

        URI location = uriInfo.getAbsolutePathBuilder().path(id.toString()).build();
        return Response.created(location).entity(Map.of("id", id)).build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public OperatingPointResponse updatePoint(
        @PathParam("id") UUID id,
        @Valid OperatingPointRequest req
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int updated = em.createNativeQuery(
            "UPDATE operating_point SET name = :name, address_street = :street, " +
            "address_city = :city, address_state = :state, address_zip = :zip, " +
            "latitude = :lat, longitude = :lng, commission_pct = :comm, " +
            "contract_type = :ct, updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("name", req.name())
            .setParameter("street", req.addressStreet())
            .setParameter("city", req.addressCity())
            .setParameter("state", req.addressState())
            .setParameter("zip", req.addressZip())
            .setParameter("lat", req.latitude())
            .setParameter("lng", req.longitude())
            .setParameter("comm", req.commissionPct())
            .setParameter("ct", req.contractType())
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Operating point not found: " + id);
        audit.record("OPERATING_POINT_UPDATED", "operating_point", id.toString(), JsonUtil.obj("name", req.name()));
        return getPoint(id);
    }

    // ── Helper ──────────────────────────────────────────────────────────────────

    private OperatingPointResponse mapRow(Object[] r) {
        return new OperatingPointResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2],
            (String) r[3], (String) r[4], (String) r[5], (String) r[6],
            r[7] != null ? ((Number) r[7]).doubleValue() : null,
            r[8] != null ? ((Number) r[8]).doubleValue() : null,
            (java.math.BigDecimal) r[9], (String) r[10], (String) r[11],
            r[12] != null ? ((Number) r[12]).intValue() : null
        );
    }
}
