package com.gruahub.maintenance.api;

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
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Idempotente via client_operation_id. */
@Path("/api/v1/maintenance")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class MaintenanceResource {

    private static final Logger LOG = Logger.getLogger(MaintenanceResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;


    public record CreateTicketRequest(
        @NotNull UUID clientOperationId,
        @NotNull UUID machineId,
        @NotBlank @Size(max = 200) String title,
        @Size(max = 2000) String description,
        @NotBlank String priority,  // LOW, MEDIUM, HIGH, CRITICAL
        String symptomCode
    ) {}

    public record UpdateTicketRequest(
        @NotBlank String status,    // OPEN, IN_PROGRESS, RESOLVED, CLOSED
        @Size(max = 2000) String resolutionNotes,
        String assignedTo
    ) {}

    public record TicketResponse(
        UUID id,
        UUID machineId,
        String machineAssetNumber,
        String title,
        String description,
        String status,
        String priority,
        String symptomCode,
        String assignedTo,
        String resolutionNotes,
        Instant createdAt,
        Instant updatedAt,
        Instant resolvedAt
    ) {}


    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "TECHNICIAN", "FIELD_OPERATOR"})
    public PageResponse<TicketResponse> listTickets(
        @QueryParam("machineId") UUID machineId,
        @QueryParam("status") String status,
        @QueryParam("priority") String priority,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE t.tenant_id = :tid ");
        if (machineId != null) where.append("AND t.machine_id = :mid ");
        if (status != null) where.append("AND t.status = :status ");
        if (priority != null) where.append("AND t.priority = :priority ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM maintenance_ticket t " + where
        ).setParameter("tid", tenantId);
        if (machineId != null) countQuery.setParameter("mid", machineId);
        if (status != null) countQuery.setParameter("status", status);
        if (priority != null) countQuery.setParameter("priority", priority);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT t.id, t.machine_id, m.asset_number, t.title, t.description, " +
            "t.status, t.priority, t.symptom_code, t.assigned_to, t.resolution_notes, " +
            "t.created_at, t.updated_at, t.resolved_at " +
            "FROM maintenance_ticket t " +
            "JOIN machine m ON m.id = t.machine_id " +
            where +
            "ORDER BY t.created_at DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);
        if (machineId != null) q.setParameter("mid", machineId);
        if (status != null) q.setParameter("status", status);
        if (priority != null) q.setParameter("priority", priority);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapRow).toList(), page, lim, total);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "TECHNICIAN", "FIELD_OPERATOR"})
    public TicketResponse getTicket(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] row = (Object[]) em.createNativeQuery(
            "SELECT t.id, t.machine_id, m.asset_number, t.title, t.description, " +
            "t.status, t.priority, t.symptom_code, t.assigned_to, t.resolution_notes, " +
            "t.created_at, t.updated_at, t.resolved_at " +
            "FROM maintenance_ticket t " +
            "JOIN machine m ON m.id = t.machine_id " +
            "WHERE t.id = :id AND t.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (row == null) throw new NotFoundException("Ticket not found: " + id);
        return mapRow(row);
    }


    @POST
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "TECHNICIAN", "FIELD_OPERATOR"})
    public Response createTicket(
        @Valid CreateTicketRequest req,
        @Context UriInfo uriInfo
    ) {
        UUID tenantId = TenantContext.getTenantId();

        long existing = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM maintenance_ticket " +
            "WHERE client_operation_id = :coid AND tenant_id = :tid"
        )
            .setParameter("coid", req.clientOperationId().toString())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();

        if (existing > 0) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Ticket already created for this operation"))
                .build();
        }

        long machineCount = ((Number) em.createNativeQuery(
            "SELECT COUNT(*) FROM machine WHERE id = :mid AND tenant_id = :tid"
        )
            .setParameter("mid", req.machineId())
            .setParameter("tid", tenantId)
            .getSingleResult()).longValue();
        if (machineCount == 0) throw new BadRequestException("Machine not found in tenant");

        String symptom = req.symptomCode() != null && !req.symptomCode().isBlank()
            ? req.symptomCode()
            : req.title();

        UUID ticketId = UUID.randomUUID();
        em.createNativeQuery(
            "INSERT INTO maintenance_ticket " +
            "(id, tenant_id, client_operation_id, machine_id, title, description, " +
            " priority, symptom_code, symptom, status) " +
            "VALUES (:id, :tid, :coid, :mid, :title, :desc, :prio, :symptomCode, :symptom, 'OPEN')"
        )
            .setParameter("id", ticketId)
            .setParameter("tid", tenantId)
            .setParameter("coid", req.clientOperationId().toString())
            .setParameter("mid", req.machineId())
            .setParameter("title", req.title())
            .setParameter("desc", req.description())
            .setParameter("prio", req.priority())
            .setParameter("symptomCode", req.symptomCode())
            .setParameter("symptom", symptom)
            .executeUpdate();

        // Coloca máquina em MAINTENANCE se ticket for HIGH ou CRITICAL
        if ("HIGH".equals(req.priority()) || "CRITICAL".equals(req.priority())) {
            em.createNativeQuery(
                "UPDATE machine SET status = 'MAINTENANCE', updated_at = NOW() " +
                "WHERE id = :mid AND tenant_id = :tid AND status = 'ACTIVE'"
            )
                .setParameter("mid", req.machineId())
                .setParameter("tid", tenantId)
                .executeUpdate();
        }

        audit.record("MAINTENANCE_TICKET_CREATED", "maintenance_ticket", ticketId.toString(),
            JsonUtil.obj("machineId", req.machineId().toString(), "priority", req.priority()));

        URI location = uriInfo.getAbsolutePathBuilder().path(ticketId.toString()).build();
        return Response.created(location).entity(Map.of("id", ticketId)).build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "TECHNICIAN"})
    public TicketResponse updateTicket(
        @PathParam("id") UUID id,
        @Valid UpdateTicketRequest req
    ) {
        UUID tenantId = TenantContext.getTenantId();
        boolean resolving = "RESOLVED".equals(req.status()) || "CLOSED".equals(req.status());

        int updated = em.createNativeQuery(
            "UPDATE maintenance_ticket SET status = :status, " +
            "resolution_notes = :notes, assigned_to = :assigned, " +
            "resolved_at = CASE WHEN :resolving THEN NOW() ELSE resolved_at END, " +
            "updated_at = NOW() " +
            "WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("status", req.status())
            .setParameter("notes", req.resolutionNotes())
            .setParameter("assigned", req.assignedTo())
            .setParameter("resolving", resolving)
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .executeUpdate();

        if (updated == 0) throw new NotFoundException("Ticket not found: " + id);

        audit.record("MAINTENANCE_TICKET_UPDATED", "maintenance_ticket", id.toString(),
            JsonUtil.obj("status", req.status()));
        return getTicket(id);
    }


    private TicketResponse mapRow(Object[] r) {
        return new TicketResponse(
            (UUID) r[0], (UUID) r[1], (String) r[2], (String) r[3], (String) r[4],
            (String) r[5], (String) r[6], (String) r[7], (String) r[8], (String) r[9],
            r[10] != null ? ((java.sql.Timestamp) r[10]).toInstant() : null,
            r[11] != null ? ((java.sql.Timestamp) r[11]).toInstant() : null,
            r[12] != null ? ((java.sql.Timestamp) r[12]).toInstant() : null
        );
    }
}
