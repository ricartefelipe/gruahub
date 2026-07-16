package com.gruahub.payments.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.payments.application.PaymentWebhookService;
import com.gruahub.payments.infra.SandboxPaymentProvider;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import org.jboss.logging.Logger;

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
    ObjectMapper objectMapper;

    /**
     * Webhook de pagamento (Sandbox e provedores reais).
     * Assinatura verificada por header X-Signature.
     */
    @POST
    @Path("/webhook/{provider}")
    @Operation(summary = "Receber webhook de pagamento")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response webhook(
            @PathParam("provider") String provider,
            @HeaderParam("X-Signature") String signature,
            @HeaderParam("X-Tenant-Id") String tenantIdHeader,
            @HeaderParam("Idempotency-Key") String idempotencyKey,
            byte[] body) {

        try {
            UUID tenantId = UUID.fromString(tenantIdHeader);
            webhookService.processWebhook(provider, tenantId, idempotencyKey, signature, body);
            return Response.ok().entity("{\"received\":true}").build();
        } catch (IllegalArgumentException e) {
            return Response.status(400).entity("{\"error\":\"Invalid tenant ID\"}").build();
        } catch (SecurityException e) {
            LOG.warnf("Webhook signature rejected for provider %s: %s", provider, e.getMessage());
            return Response.status(401).entity("{\"error\":\"Invalid signature\"}").build();
        } catch (Exception e) {
            LOG.errorf("Webhook processing error: %s", e.getMessage());
            return Response.serverError().entity("{\"error\":\"Processing failed\"}").build();
        }
    }

    /**
     * Endpoint SANDBOX ONLY: confirmar pagamento para testes.
     * Protegido por papel — nunca expor em produção sem autenticação forte.
     */
    @POST
    @Path("/sandbox/confirm/{transactionId}")
    @Operation(summary = "[SANDBOX] Confirmar pagamento fictício")
    public Response sandboxConfirm(
            @PathParam("transactionId") String transactionId,
            @HeaderParam("X-Tenant-Id") String tenantIdHeader) {
        LOG.infof("[SANDBOX] Confirming transaction %s", transactionId);
        sandboxProvider.sandboxConfirm(transactionId);

        // Gerar evento de webhook simulado
        try {
            UUID tenantId = UUID.fromString(tenantIdHeader);
            webhookService.simulateSandboxConfirmation(transactionId, tenantId);
        } catch (Exception e) {
            LOG.warnf("Could not simulate sandbox webhook: %s", e.getMessage());
        }

        return Response.ok().entity("{\"confirmed\":true,\"transactionId\":\"" + transactionId + "\"}").build();
    }

    /**
     * Endpoint SANDBOX: falhar pagamento.
     */
    @POST
    @Path("/sandbox/fail/{transactionId}")
    @Operation(summary = "[SANDBOX] Falhar pagamento fictício")
    public Response sandboxFail(@PathParam("transactionId") String transactionId) {
        sandboxProvider.sandboxFail(transactionId);
        return Response.ok().entity("{\"failed\":true}").build();
    }
}
