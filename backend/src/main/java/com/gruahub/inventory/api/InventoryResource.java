package com.gruahub.inventory.api;

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

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Movimentações idempotentes via client_operation_id. */
@Path("/api/v1/inventory")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class InventoryResource {

    private static final Logger LOG = Logger.getLogger(InventoryResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;


    public record StockMovementRequest(
        @NotNull UUID clientOperationId,
        @NotNull UUID machineId,
        @NotNull UUID prizeId,
        @NotBlank String movementType,
        @Min(1) int quantityDelta,
        String notes
    ) {}

    public record StockBalanceResponse(
        UUID machineId,
        String machineAssetNumber,
        UUID prizeId,
        String prizeName,
        String sku,
        int currentQuantity,
        int capacity,
        double occupancyPct
    ) {}

    public record StockMovementResponse(
        UUID id,
        UUID machineId,
        String machineAssetNumber,
        UUID prizeId,
        String prizeName,
        String movementType,
        int quantityDelta,
        int quantityBefore,
        int quantityAfter,
        String clientOperationId,
        Instant occurredAt,
        String notes
    ) {}

    public record PrizeRequest(
        @NotBlank @Size(max = 60) String sku,
        @NotBlank @Size(max = 120) String name,
        @Size(max = 500) String description,
        @Min(0) Long costCents,
        @Size(max = 30) String sizeCategory,
        Boolean active
    ) {}

    public record PrizeResponse(
        UUID id,
        String sku,
        String name,
        String description,
        Long costCents,
        String sizeCategory,
        boolean active,
        Instant createdAt
    ) {}


    @GET
    @Path("/balances")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE", "TECHNICIAN"})
    public PageResponse<StockBalanceResponse> listBalances(
        @QueryParam("machineId") UUID machineId,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("100") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 500);
        StringBuilder where = new StringBuilder("WHERE b.tenant_id = :tid ");
        if (machineId != null) where.append("AND b.machine_id = :mid ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM machine_stock_balance b " + where
        ).setParameter("tid", tenantId);
        if (machineId != null) countQuery.setParameter("mid", machineId);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT b.machine_id, m.asset_number, b.prize_id, p.name, p.sku, " +
            "b.quantity, COALESCE(b.minimum_quantity, 5), " +
            "CASE WHEN COALESCE(b.minimum_quantity, 5) > 0 " +
            "THEN (b.quantity * 100.0 / GREATEST(COALESCE(b.minimum_quantity, 5), b.quantity, 1)) " +
            "ELSE 0 END as pct " +
            "FROM machine_stock_balance b " +
            "JOIN machine m ON m.id = b.machine_id " +
            "JOIN prize p ON p.id = b.prize_id " +
            where +
            "ORDER BY pct ASC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (machineId != null) q.setParameter("mid", machineId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        var content = rows.stream().map(r -> new StockBalanceResponse(
            (UUID) r[0], (String) r[1], (UUID) r[2], (String) r[3], (String) r[4],
            ((Number) r[5]).intValue(), ((Number) r[6]).intValue(),
            ((Number) r[7]).doubleValue()
        )).toList();
        return PageResponse.of(content, page, lim, total);
    }

    @GET
    @Path("/movements")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public PageResponse<StockMovementResponse> listMovements(
        @QueryParam("machineId") UUID machineId,
        @QueryParam("movementType") String movementType,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE sm.tenant_id = :tid ");
        if (machineId != null) where.append("AND sm.machine_id = :mid ");
        if (movementType != null) where.append("AND sm.movement_type = :mt ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM stock_movement sm " + where
        ).setParameter("tid", tenantId);
        if (machineId != null) countQuery.setParameter("mid", machineId);
        if (movementType != null) countQuery.setParameter("mt", movementType);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT sm.id, sm.machine_id, m.asset_number, sm.prize_id, p.name, " +
            "sm.movement_type, sm.quantity_delta, sm.quantity_before, sm.quantity_after, " +
            "sm.client_operation_id, sm.occurred_at, sm.notes " +
            "FROM stock_movement sm " +
            "LEFT JOIN machine m ON m.id = sm.machine_id " +
            "JOIN prize p ON p.id = sm.prize_id " +
            where +
            "ORDER BY sm.occurred_at DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (machineId != null) q.setParameter("mid", machineId);
        if (movementType != null) q.setParameter("mt", movementType);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapMovRow).toList(), page, lim, total);
    }


    @POST
    @Path("/movements")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR"})
    public Response recordMovement(
        @Valid StockMovementRequest req,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();

        // Idempotência offline-first
        long existing = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM stock_movement WHERE client_operation_id = :coid AND tenant_id = :tid"
        )
            .setParameter("coid", req.clientOperationId().toString())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();

        if (existing > 0) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Movement already recorded"))
                .build();
        }

        long machineCount = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM machine WHERE id = :mid AND tenant_id = :tid"
        )
            .setParameter("mid", req.machineId())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();
        if (machineCount == 0) {
            throw new BadRequestException("Machine not found in tenant");
        }

        long prizeCount = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM prize WHERE id = :pid AND tenant_id = :tid"
        )
            .setParameter("pid", req.prizeId())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();
        if (prizeCount == 0) {
            throw new BadRequestException("Prize not found in tenant");
        }

        int delta = "PRIZE_GIVEN".equals(req.movementType())
            ? -Math.abs(req.quantityDelta())
            : Math.abs(req.quantityDelta());

        Number newQty = (Number) em.createNativeQuery(
            "INSERT INTO machine_stock_balance " +
            "  (id, tenant_id, machine_id, prize_id, quantity, minimum_quantity, version) " +
            "VALUES (:newId, :tid, :mid, :pid, GREATEST(0, :delta), 5, 0) " +
            "ON CONFLICT (machine_id, prize_id) DO UPDATE " +
            "  SET quantity = GREATEST(0, machine_stock_balance.quantity + :delta), " +
            "      updated_at = NOW(), " +
            "      version = machine_stock_balance.version + 1 " +
            "  WHERE machine_stock_balance.tenant_id = :tid " +
            "RETURNING quantity"
        )
            .setParameter("newId", UUID.randomUUID())
            .setParameter("tid", tenantId)
            .setParameter("mid", req.machineId())
            .setParameter("pid", req.prizeId())
            .setParameter("delta", delta)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        if (newQty == null) {
            throw new BadRequestException("Stock balance conflict across tenants");
        }

        int after  = newQty != null ? newQty.intValue() : Math.max(0, delta);
        // before ≈ after - delta (clamp 0); ±1 aceitável sob clamping concorrente.
        int before = Math.max(0, after - delta);

        UUID movId = UUID.randomUUID();
        em.createNativeQuery(
            "INSERT INTO stock_movement " +
            "(id, tenant_id, machine_id, prize_id, movement_type, quantity, quantity_delta, " +
            " quantity_before, quantity_after, client_operation_id, notes) " +
            "VALUES (:id, :tid, :mid, :pid, :mt, :qty, :delta, :before, :after, :coid, :notes)"
        )
            .setParameter("id", movId)
            .setParameter("tid", tenantId)
            .setParameter("mid", req.machineId())
            .setParameter("pid", req.prizeId())
            .setParameter("mt", req.movementType())
            .setParameter("qty", Math.abs(delta))
            .setParameter("delta", delta)
            .setParameter("before", before)
            .setParameter("after", after)
            .setParameter("coid", req.clientOperationId().toString())
            .setParameter("notes", req.notes())
            .executeUpdate();

        audit.record("STOCK_MOVEMENT_RECORDED", "stock_movement", movId.toString(),
            JsonUtil.obj("movementType", req.movementType(),
                         "quantityDelta", String.valueOf(delta)));

        URI location = uriInfo.getBaseUriBuilder()
            .path("/api/v1/inventory/movements/{id}").build(movId);
        return Response.created(location).entity(Map.of("id", movId)).build();
    }

    @GET
    @Path("/prizes")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE", "TECHNICIAN"})
    public PageResponse<PrizeResponse> listPrizes(
        @QueryParam("active") Boolean active,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("100") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 500);
        StringBuilder where = new StringBuilder("WHERE p.tenant_id = :tid ");
        if (active != null) where.append("AND p.active = :active ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM prize p " + where
        ).setParameter("tid", tenantId);
        if (active != null) countQuery.setParameter("active", active);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT p.id, p.sku, p.name, p.description, p.cost_cents, p.size_category, " +
            "p.active, p.created_at " +
            "FROM prize p " + where +
            "ORDER BY p.name LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (active != null) q.setParameter("active", active);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapPrizeRow).toList(), page, lim, total);
    }

    @POST
    @Path("/prizes")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public Response createPrize(@Valid PrizeRequest req, @Context UriInfo uriInfo) {
        UUID tenantId = TenantContext.getTenantId();
        UUID id = UUID.randomUUID();
        boolean active = req.active() == null || req.active();

        try {
            em.createNativeQuery(
                "INSERT INTO prize " +
                "(id, tenant_id, sku, name, description, cost_cents, size_category, active, created_at) " +
                "VALUES (:id, :tid, :sku, :name, :description, :cost, :size, :active, NOW())"
            )
                .setParameter("id", id)
                .setParameter("tid", tenantId)
                .setParameter("sku", req.sku())
                .setParameter("name", req.name())
                .setParameter("description", req.description())
                .setParameter("cost", req.costCents() != null ? req.costCents() : 0L)
                .setParameter("size", req.sizeCategory())
                .setParameter("active", active)
                .executeUpdate();
        } catch (Exception e) {
            throw new BadRequestException("SKU already exists or invalid prize data");
        }

        audit.record("PRIZE_CREATED", "prize", id.toString(),
            JsonUtil.obj("sku", req.sku(), "name", req.name()));

        URI location = uriInfo.getBaseUriBuilder()
            .path("/api/v1/inventory/prizes/{id}").build(id);
        return Response.created(location).entity(getPrize(id, tenantId)).build();
    }

    @PUT
    @Path("/prizes/{id}")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN"})
    public PrizeResponse updatePrize(@PathParam("id") UUID id, @Valid PrizeRequest req) {
        UUID tenantId = TenantContext.getTenantId();
        boolean active = req.active() == null || req.active();

        int updated = em.createNativeQuery(
            "UPDATE prize SET sku = :sku, name = :name, description = :description, " +
            "cost_cents = :cost, size_category = :size, active = :active " +
            "WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("sku", req.sku())
            .setParameter("name", req.name())
            .setParameter("description", req.description())
            .setParameter("cost", req.costCents() != null ? req.costCents() : 0L)
            .setParameter("size", req.sizeCategory())
            .setParameter("active", active)
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Prize not found: " + id);

        audit.record("PRIZE_UPDATED", "prize", id.toString(),
            JsonUtil.obj("sku", req.sku(), "name", req.name()));

        return getPrize(id, tenantId);
    }

    private PrizeResponse getPrize(UUID id, UUID tenantId) {
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT p.id, p.sku, p.name, p.description, p.cost_cents, p.size_category, " +
            "p.active, p.created_at " +
            "FROM prize p WHERE p.id = :id AND p.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (row == null) throw new NotFoundException("Prize not found: " + id);
        return mapPrizeRow(row);
    }

    private PrizeResponse mapPrizeRow(Object[] r) {
        return new PrizeResponse(
            (UUID) r[0],
            (String) r[1],
            (String) r[2],
            (String) r[3],
            r[4] != null ? ((Number) r[4]).longValue() : 0L,
            (String) r[5],
            r[6] != null && (Boolean) r[6],
            r[7] != null ? NativeQueryValues.toInstant(r[7]) : null
        );
    }

    private StockMovementResponse mapMovRow(Object[] r) {
        return new StockMovementResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2], (UUID) r[3], (String) r[4],
            (String) r[5],
            ((Number) r[6]).intValue(), ((Number) r[7]).intValue(), ((Number) r[8]).intValue(),
            (String) r[9],
            r[10] != null ? NativeQueryValues.toInstant(r[10]) : null,
            (String) r[11]
        );
    }
}
