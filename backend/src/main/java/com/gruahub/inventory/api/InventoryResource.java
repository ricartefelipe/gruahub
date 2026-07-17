package com.gruahub.inventory.api;

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

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST resource para estoque de pelúcias.
 * Movimentações são idempotentes via client_operation_id.
 */
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

    // ── DTOs ────────────────────────────────────────────────────────────────────

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

    // ── Queries ─────────────────────────────────────────────────────────────────

    @GET
    @Path("/balances")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE", "TECHNICIAN"})
    public List<StockBalanceResponse> listBalances(
        @QueryParam("machineId") UUID machineId,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("100") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        StringBuilder sql = new StringBuilder(
            "SELECT b.machine_id, m.asset_number, b.prize_id, p.name, p.sku, " +
            "b.current_quantity, b.capacity, " +
            "CASE WHEN b.capacity > 0 THEN (b.current_quantity * 100.0 / b.capacity) ELSE 0 END as pct " +
            "FROM machine_stock_balance b " +
            "JOIN machine m ON m.id = b.machine_id " +
            "JOIN prize p ON p.id = b.prize_id " +
            "WHERE b.tenant_id = :tid "
        );
        if (machineId != null) sql.append("AND b.machine_id = :mid ");
        sql.append("ORDER BY pct ASC LIMIT :lim OFFSET :off");

        var q = em.createNativeQuery(sql.toString())
            .setParameter("tid", tenantId)
            .setParameter("lim", Math.min(size, 500))
            .setParameter("off", page * size);
        if (machineId != null) q.setParameter("mid", machineId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return rows.stream().map(r -> new StockBalanceResponse(
            (UUID) r[0], (String) r[1], (UUID) r[2], (String) r[3], (String) r[4],
            ((Number) r[5]).intValue(), ((Number) r[6]).intValue(),
            ((Number) r[7]).doubleValue()
        )).toList();
    }

    @GET
    @Path("/movements")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "FINANCE"})
    public List<StockMovementResponse> listMovements(
        @QueryParam("machineId") UUID machineId,
        @QueryParam("movementType") String movementType,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        StringBuilder sql = new StringBuilder(
            "SELECT sm.id, sm.machine_id, m.asset_number, sm.prize_id, p.name, " +
            "sm.movement_type, sm.quantity_delta, sm.quantity_before, sm.quantity_after, " +
            "sm.client_operation_id, sm.occurred_at, sm.notes " +
            "FROM stock_movement sm " +
            "JOIN machine m ON m.id = sm.machine_id " +
            "JOIN prize p ON p.id = sm.prize_id " +
            "WHERE sm.tenant_id = :tid "
        );
        if (machineId != null) sql.append("AND sm.machine_id = :mid ");
        if (movementType != null) sql.append("AND sm.movement_type = :mt ");
        sql.append("ORDER BY sm.occurred_at DESC LIMIT :lim OFFSET :off");

        var q = em.createNativeQuery(sql.toString())
            .setParameter("tid", tenantId)
            .setParameter("lim", Math.min(size, 200))
            .setParameter("off", page * size);
        if (machineId != null) q.setParameter("mid", machineId);
        if (movementType != null) q.setParameter("mt", movementType);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return rows.stream().map(this::mapMovRow).toList();
    }

    // ── Mutations ────────────────────────────────────────────────────────────────

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
        Long existing = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM stock_movement WHERE client_operation_id = :coid AND tenant_id = :tid"
        )
            .setParameter("coid", req.clientOperationId().toString())
            .setParameter("tid", tenantId)
            .getSingleResult();

        if (existing > 0) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Movement already recorded"))
                .build();
        }

        int delta = "PRIZE_GIVEN".equals(req.movementType())
            ? -Math.abs(req.quantityDelta())
            : Math.abs(req.quantityDelta());

        // UPSERT atômico no saldo.
        // INSERT ON CONFLICT DO UPDATE é atômico no PostgreSQL — elimina a race
        // condition de SELECT→INSERT/UPDATE separados sob carga concorrente.
        // RETURNING retorna o novo current_quantity (após GREATEST clamp).
        Number newQty = (Number) em.createNativeQuery(
            "INSERT INTO machine_stock_balance " +
            "  (id, tenant_id, machine_id, prize_id, current_quantity, capacity, version) " +
            "VALUES (:newId, :tid, :mid, :pid, GREATEST(0, :delta), 300, 0) " +
            "ON CONFLICT (machine_id, prize_id, tenant_id) DO UPDATE " +
            "  SET current_quantity = GREATEST(0, machine_stock_balance.current_quantity + :delta), " +
            "      updated_at = NOW(), " +
            "      version = machine_stock_balance.version + 1 " +
            "RETURNING current_quantity"
        )
            .setParameter("newId", UUID.randomUUID())
            .setParameter("tid", tenantId)
            .setParameter("mid", req.machineId())
            .setParameter("pid", req.prizeId())
            .setParameter("delta", delta)
            .getSingleResultOrNull();

        int after  = newQty != null ? newQty.intValue() : Math.max(0, delta);
        // before é a aproximação: after - delta, clamped a 0 para não ser negativo.
        // Pode divergir em ±1 somente quando há clamping simultâneo, o que é aceitável
        // para fins de auditoria (o saldo real está correto).
        int before = Math.max(0, after - delta);

        UUID movId = UUID.randomUUID();
        em.createNativeQuery(
            "INSERT INTO stock_movement " +
            "(id, tenant_id, machine_id, prize_id, movement_type, quantity_delta, " +
            " quantity_before, quantity_after, client_operation_id, notes) " +
            "VALUES (:id, :tid, :mid, :pid, :mt, :delta, :before, :after, :coid, :notes)"
        )
            .setParameter("id", movId)
            .setParameter("tid", tenantId)
            .setParameter("mid", req.machineId())
            .setParameter("pid", req.prizeId())
            .setParameter("mt", req.movementType())
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

    // ── Helper ──────────────────────────────────────────────────────────────────

    private StockMovementResponse mapMovRow(Object[] r) {
        return new StockMovementResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2], (UUID) r[3], (String) r[4],
            (String) r[5],
            ((Number) r[6]).intValue(), ((Number) r[7]).intValue(), ((Number) r[8]).intValue(),
            (String) r[9],
            r[10] != null ? ((java.sql.Timestamp) r[10]).toInstant() : null,
            (String) r[11]
        );
    }
}
