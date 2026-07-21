package com.gruahub.payments.api;

import com.gruahub.payments.application.PaymentInitiationService;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.shared.api.PageResponse;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * REST resource para consulta de transações de pagamento.
 * As mutações (webhook, confirm sandbox) ficam em PaymentWebhookResource.
 */
@Path("/api/v1/payments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class PaymentResource {

    @Inject
    EntityManager em;

    @Inject
    PaymentInitiationService initiationService;

    public record InitiatePaymentRequest(
        @NotNull UUID machineId,
        @Min(1) Long amountCents,
        String provider
    ) {}

    public record PaymentResponse(
        UUID id,
        String providerTransactionId,
        String provider,
        long amountCents,
        String currency,
        String status,
        UUID machineId,
        String machineAssetNumber,
        String paymentMethod,
        Instant createdAt,
        Instant confirmedAt
    ) {}

    @POST
    @Path("/initiate")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FINANCE"})
    public Response initiatePayment(@Valid InitiatePaymentRequest request) {
        var result = initiationService.initiate(
                request.machineId(),
                request.amountCents(),
                request.provider()
        );
        return Response.status(Response.Status.CREATED).entity(result).build();
    }

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public PageResponse<PaymentResponse> listPayments(
        @QueryParam("status") String status,
        @QueryParam("machineId") UUID machineId,
        @QueryParam("page") @DefaultValue("0") int page,
        @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(size, 200);
        StringBuilder where = new StringBuilder("WHERE pt.tenant_id = :tid ");
        if (status != null) where.append("AND pt.status = :status ");
        if (machineId != null) where.append("AND pt.machine_id = :mid ");

        var countQuery = em.createNativeQuery(
            "SELECT COUNT(*) FROM payment_transaction pt " + where
        ).setParameter("tid", tenantId);
        if (status != null) countQuery.setParameter("status", status);
        if (machineId != null) countQuery.setParameter("mid", machineId);
        long total = ((Number) countQuery.getSingleResult()).longValue();

        String sql =
            "SELECT pt.id, pt.provider_transaction_id, pt.provider, pt.amount_cents, " +
            "pt.currency, pt.status, pt.machine_id, m.asset_number, pt.payment_method, " +
            "pt.created_at, pt.confirmed_at " +
            "FROM payment_transaction pt " +
            "LEFT JOIN machine m ON m.id = pt.machine_id " +
            where +
            "ORDER BY pt.created_at DESC LIMIT :lim OFFSET :off";

        var q = em.createNativeQuery(sql)
            .setParameter("tid", tenantId)
            .setParameter("lim", lim)
            .setParameter("off", page * lim);

        if (status != null) q.setParameter("status", status);
        if (machineId != null) q.setParameter("mid", machineId);

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        var content = rows.stream().map(r -> new PaymentResponse(
            (UUID) r[0], (String) r[1], (String) r[2],
            r[3] != null ? ((Number) r[3]).longValue() : 0L,
            (String) r[4], (String) r[5], (UUID) r[6], (String) r[7], (String) r[8],
            r[9] != null ? ((java.sql.Timestamp) r[9]).toInstant() : null,
            r[10] != null ? ((java.sql.Timestamp) r[10]).toInstant() : null
        )).toList();
        return PageResponse.of(content, page, lim, total);
    }

    @GET
    @Path("/{id}")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public PaymentResponse getPayment(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        Object[] r = (Object[]) em.createNativeQuery(
            "SELECT pt.id, pt.provider_transaction_id, pt.provider, pt.amount_cents, " +
            "pt.currency, pt.status, pt.machine_id, m.asset_number, pt.payment_method, " +
            "pt.created_at, pt.confirmed_at " +
            "FROM payment_transaction pt " +
            "LEFT JOIN machine m ON m.id = pt.machine_id " +
            "WHERE pt.id = :id AND pt.tenant_id = :tid"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (r == null) throw new NotFoundException("Payment not found: " + id);

        return new PaymentResponse(
            (UUID) r[0], (String) r[1], (String) r[2],
            r[3] != null ? ((Number) r[3]).longValue() : 0L,
            (String) r[4], (String) r[5], (UUID) r[6], (String) r[7], (String) r[8],
            r[9] != null ? ((java.sql.Timestamp) r[9]).toInstant() : null,
            r[10] != null ? ((java.sql.Timestamp) r[10]).toInstant() : null
        );
    }
}
