package com.gruahub.payments.api;

import com.gruahub.payments.application.PaymentWebhookService;
import com.gruahub.payments.infra.SandboxPaymentProvider;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Path("/api/v1/payments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Payments", description = "Pagamentos e webhooks")
public class PaymentWebhookResource {

    private static final Logger LOG = Logger.getLogger(PaymentWebhookResource.class);

    @Inject
    PaymentWebhookService webhookService;

    @Inject
    SandboxPaymentProvider sandboxProvider;

    @Inject
    EntityManager em;

    /** HMAC antes do parse; tenant do header X-Tenant-Id, nunca do body. */
    @POST
    @Path("/webhook/{provider}")
    @Operation(summary = "Receber webhook de pagamento")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response webhook(
            @PathParam("provider") String provider,
            @HeaderParam("X-Signature") String signature,
            @HeaderParam("x-signature") String signatureAlt,
            @HeaderParam("X-Request-Id") String requestId,
            @HeaderParam("x-request-id") String requestIdAlt,
            @HeaderParam("X-Tenant-Id") String tenantIdHeader,
            @HeaderParam("Idempotency-Key") String idempotencyKey,
            @QueryParam("data.id") String dataIdQuery,
            byte[] body) {

        if (body == null || body.length == 0) {
            return Response.status(400).entity(Map.of("error", "Empty body")).build();
        }

        boolean tenantHeaderRequired = "sandbox".equalsIgnoreCase(provider);
        if (tenantHeaderRequired && (tenantIdHeader == null || tenantIdHeader.isBlank())) {
            return Response.status(400).entity(Map.of("error", "Invalid tenant ID")).build();
        }

        String effectiveSignature = signature != null && !signature.isBlank() ? signature : signatureAlt;
        String effectiveRequestId = requestId != null && !requestId.isBlank() ? requestId : requestIdAlt;

        try {
            UUID tenantId = null;
            if (tenantIdHeader != null && !tenantIdHeader.isBlank()) {
                tenantId = UUID.fromString(tenantIdHeader);
            }
            webhookService.processWebhook(
                    provider,
                    tenantId,
                    idempotencyKey,
                    effectiveSignature,
                    effectiveRequestId,
                    dataIdQuery,
                    body);
            return Response.ok(Map.of("received", true)).build();

        } catch (IllegalArgumentException e) {
            return Response.status(400).entity(Map.of("error", e.getMessage())).build();
        } catch (SecurityException e) {
            LOG.warnf("Webhook signature rejected provider=%s: %s", provider, e.getMessage());
            return Response.status(401).entity(Map.of("error", "Invalid signature")).build();
        } catch (Exception e) {
            LOG.errorf("Webhook processing error provider=%s: %s", provider, e.getMessage());
            return Response.serverError().entity(Map.of("error", "Processing failed")).build();
        }
    }

    /** [SANDBOX] Nunca expor em produção sem autenticação forte. */
    @POST
    @Path("/sandbox/initiate")
    @SandboxEndpoint
    @Transactional
    @Operation(summary = "[SANDBOX] Criar transação de pagamento fictícia")
    public Response sandboxInitiate(
            @HeaderParam("X-Tenant-Id") String tenantIdHeader,
            @HeaderParam("X-Machine-Id") String machineIdHeader) {

        UUID tenantId;
        UUID machineId;
        try {
            tenantId  = UUID.fromString(tenantIdHeader);
            machineId = UUID.fromString(machineIdHeader);
        } catch (Exception e) {
            return Response.status(400).entity(Map.of("error", "Invalid X-Tenant-Id or X-Machine-Id")).build();
        }

        String transactionId = "SANDBOX-" + UUID.randomUUID().toString().replace("-", "").toUpperCase().substring(0, 12);
        sandboxProvider.sandboxCreate(transactionId);

        em.createNativeQuery(
                "INSERT INTO payment_transaction " +
                "(id, tenant_id, machine_id, provider_transaction_id, provider, " +
                " amount_cents, currency, payment_method, status, created_at, updated_at) " +
                "VALUES (gen_random_uuid(), :tid, :mid, :txId, 'SANDBOX', " +
                "200, 'BRL', 'SANDBOX_QR', 'PENDING', :now, :now)")
                .setParameter("tid",  tenantId)
                .setParameter("mid",  machineId)
                .setParameter("txId", transactionId)
                .setParameter("now",  Instant.now())
                .executeUpdate();

        LOG.infof("[SANDBOX] Initiated transaction %s for machine %s", transactionId, machineId);
        return Response.ok(Map.of(
                "transactionId", transactionId,
                "status", "PENDING",
                "sandbox", true
        )).build();
    }

    @POST
    @Path("/sandbox/confirm/{transactionId}")
    @SandboxEndpoint
    @Operation(summary = "[SANDBOX] Confirmar pagamento fictício")
    public Response sandboxConfirm(
            @PathParam("transactionId")  String transactionId,
            @HeaderParam("X-Tenant-Id") String tenantIdHeader,
            @HeaderParam("X-Machine-Id") String machineIdHeader) {

        LOG.infof("[SANDBOX] Confirming transaction %s", transactionId);
        sandboxProvider.sandboxConfirm(transactionId);

        try {
            UUID tenantId  = UUID.fromString(tenantIdHeader);
            UUID machineId = null;
            try { machineId = UUID.fromString(machineIdHeader); } catch (Exception ignored) {}

            webhookService.simulateSandboxConfirmation(transactionId, tenantId, machineId);
        } catch (IllegalArgumentException e) {
            LOG.warnf("Could not derive tenantId for sandbox confirm: %s", e.getMessage());
        } catch (Exception e) {
            LOG.warnf("Could not simulate sandbox webhook: %s", e.getMessage());
        }

        return Response.ok(Map.of("confirmed", true, "transactionId", transactionId)).build();
    }

    @POST
    @Path("/sandbox/fail/{transactionId}")
    @SandboxEndpoint
    @Operation(summary = "[SANDBOX] Falhar pagamento fictício")
    public Response sandboxFail(@PathParam("transactionId") String transactionId) {
        sandboxProvider.sandboxFail(transactionId);
        return Response.ok(Map.of("failed", true)).build();
    }
}
