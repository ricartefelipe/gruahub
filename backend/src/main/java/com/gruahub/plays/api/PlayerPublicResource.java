package com.gruahub.plays.api;

import com.gruahub.payments.application.PaymentInitiationService;
import com.gruahub.plays.application.PlayerMachineLookup;
import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.List;
import java.util.UUID;

@Path("/api/v1/public")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
@PermitAll
@Tag(name = "Player Public", description = "APIs públicas do fluxo do jogador (sem login)")
public class PlayerPublicResource {

    @Inject
    PlayerMachineLookup machineLookup;

    @Inject
    PaymentInitiationService initiationService;

    @Inject
    EntityManager em;

    public record PublicMachineResponse(
            UUID machineId,
            String name,
            String assetNumber,
            String qrCode,
            long playPriceCents,
            String currency,
            String status
    ) {}

    public record PublicInitiateRequest(
            @NotBlank String machineToken,
            @Min(1) Long amountCents
    ) {}

    public record PublicInitiateResponse(
            UUID paymentId,
            String providerTransactionId,
            String provider,
            long amountCents,
            String currency,
            String status,
            String paymentMethod,
            String qrCodeBase64,
            String copyPaste,
            String ticketUrl
    ) {}

    public record PublicPaymentStatusResponse(
            UUID paymentId,
            String status,
            long amountCents,
            String currency,
            UUID machineId
    ) {}

    @GET
    @Path("/machines/{token}")
    @Operation(summary = "Resolver máquina pública por QR / patrimônio / UUID")
    public PublicMachineResponse getMachine(@PathParam("token") String token) {
        var machine = machineLookup.resolve(token);
        return new PublicMachineResponse(
                machine.id(),
                machine.name(),
                machine.assetNumber(),
                machine.qrCode(),
                machine.playPriceCents(),
                machine.currency(),
                machine.status()
        );
    }

    @POST
    @Path("/payments/initiate")
    @Operation(summary = "Iniciar pagamento Pix do jogador")
    public Response initiate(@Valid PublicInitiateRequest request) {
        var machine = machineLookup.resolve(request.machineToken());
        var result = initiationService.initiate(
                machine.tenantId(),
                machine.id(),
                request.amountCents(),
                null
        );
        return Response.status(Response.Status.CREATED).entity(new PublicInitiateResponse(
                result.id(),
                result.providerTransactionId(),
                result.provider(),
                result.amountCents(),
                result.currency(),
                result.status(),
                result.paymentMethod(),
                result.qrCodeBase64(),
                result.copyPaste(),
                result.ticketUrl()
        )).build();
    }

    @GET
    @Path("/payments/{paymentId}/status")
    @Operation(summary = "Consultar status do pagamento do jogador")
    public PublicPaymentStatusResponse paymentStatus(@PathParam("paymentId") UUID paymentId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, status, amount_cents, currency, machine_id " +
                "FROM payment_transaction WHERE id = :id")
                .setParameter("id", paymentId)
                .getResultList();
        if (rows.isEmpty()) {
            throw new NotFoundException("Payment not found");
        }
        Object[] row = rows.get(0);
        return new PublicPaymentStatusResponse(
                UUID.fromString(row[0].toString()),
                row[1].toString(),
                ((Number) row[2]).longValue(),
                row[3] == null ? "BRL" : row[3].toString(),
                UUID.fromString(row[4].toString())
        );
    }
}
