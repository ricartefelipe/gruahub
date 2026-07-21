package com.gruahub.fiscal.api;

import com.gruahub.fiscal.application.FiscalDocumentService;
import com.gruahub.shared.api.PageResponse;
import com.gruahub.shared.domain.TenantContext;
import io.quarkus.qute.Template;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import org.jboss.logging.Logger;
import org.w3c.tidy.Tidy;
import org.xhtmlrenderer.pdf.ITextRenderer;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/v1/fiscal/documents")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
@RequestScoped
@Tag(name = "Fiscal", description = "Documentos fiscais stub (sem SEFAZ)")
public class FiscalDocumentResource {

    private static final Logger LOG = Logger.getLogger(FiscalDocumentResource.class);

    @Inject
    EntityManager em;

    @Inject
    FiscalDocumentService fiscalDocumentService;

    @Inject
    Template fiscalDocumentStub;

    public record CreateFromPaymentRequest(@NotNull UUID paymentId) {}

    @GET
    @Operation(summary = "Listar documentos fiscais stub")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public PageResponse<FiscalDocumentService.FiscalDocumentView> list(
            @QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(Math.max(size, 1), 200);
        StringBuilder where = new StringBuilder("WHERE tenant_id = :tid ");
        if (status != null && !status.isBlank()) {
            where.append("AND status = :st ");
        }

        var countQ = em.createNativeQuery("SELECT COUNT(*) FROM fiscal_document " + where)
                .setParameter("tid", tenantId);
        if (status != null && !status.isBlank()) {
            countQ.setParameter("st", status.trim().toUpperCase());
        }
        long total = ((Number) countQ.getSingleResult()).longValue();

        var q = em.createNativeQuery(
                "SELECT id, document_type, status, payment_transaction_id, settlement_id, " +
                "amount_cents, currency, issuer_document, issuer_name, issued_at, cancelled_at, created_at " +
                "FROM fiscal_document " + where +
                "ORDER BY created_at DESC LIMIT :lim OFFSET :off")
                .setParameter("tid", tenantId)
                .setParameter("lim", lim)
                .setParameter("off", page * lim);
        if (status != null && !status.isBlank()) {
            q.setParameter("st", status.trim().toUpperCase());
        }

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        var content = rows.stream().map(r -> new FiscalDocumentService.FiscalDocumentView(
                UUID.fromString(r[0].toString()),
                r[1].toString(),
                r[2].toString(),
                r[3] == null ? null : UUID.fromString(r[3].toString()),
                r[4] == null ? null : UUID.fromString(r[4].toString()),
                ((Number) r[5]).longValue(),
                r[6] == null ? "BRL" : r[6].toString(),
                r[7] == null ? null : r[7].toString(),
                r[8] == null ? null : r[8].toString(),
                toInstant(r[9]),
                toInstant(r[10]),
                toInstant(r[11])
        )).toList();
        return PageResponse.of(content, page, lim, total);
    }

    @GET
    @Path("/{id}")
    @Operation(summary = "Detalhe do documento fiscal stub")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public FiscalDocumentService.FiscalDocumentView get(@PathParam("id") UUID id) {
        return fiscalDocumentService.get(TenantContext.getTenantId(), id);
    }

    @POST
    @Path("/from-payment")
    @Transactional
    @Operation(summary = "Criar rascunho a partir de pagamento confirmado")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public Response createFromPayment(@Valid CreateFromPaymentRequest request) {
        UUID tenantId = TenantContext.getTenantId();
        UUID id = fiscalDocumentService.createPaymentReceiptDraft(tenantId, request.paymentId());
        return Response.status(201).entity(fiscalDocumentService.get(tenantId, id)).build();
    }

    @POST
    @Path("/{id}/issue-stub")
    @Operation(summary = "Emitir stub (marca como ISSUED_STUB)")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public FiscalDocumentService.FiscalDocumentView issueStub(@PathParam("id") UUID id) {
        return fiscalDocumentService.issueStub(TenantContext.getTenantId(), id);
    }

    @POST
    @Path("/{id}/cancel")
    @Operation(summary = "Cancelar documento fiscal stub")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public FiscalDocumentService.FiscalDocumentView cancel(@PathParam("id") UUID id) {
        return fiscalDocumentService.cancel(TenantContext.getTenantId(), id);
    }

    @GET
    @Path("/{id}/pdf")
    @Produces("application/pdf")
    @Operation(summary = "Baixar PDF stub do documento")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE"})
    public Response pdf(@PathParam("id") UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        var doc = fiscalDocumentService.get(tenantId, id);
        Map<String, Object> snapshot = fiscalDocumentService.loadSnapshot(tenantId, id);

        try {
            String html = fiscalDocumentStub
                    .data("documentId", doc.id().toString())
                    .data("status", doc.status())
                    .data("documentType", doc.documentType())
                    .data("issuerName", nullToDash(doc.issuerName()))
                    .data("issuerDocument", nullToDash(doc.issuerDocument()))
                    .data("amountLabel", formatMoney(doc.amountCents(), doc.currency()))
                    .data("assetNumber", nullToDash(asString(snapshot.get("assetNumber"))))
                    .data("machineName", nullToDash(asString(snapshot.get("machineName"))))
                    .data("provider", nullToDash(asString(snapshot.get("provider"))))
                    .data("providerTx", nullToDash(asString(snapshot.get("providerTransactionId"))))
                    .data("confirmedAt", nullToDash(asString(snapshot.get("confirmedAt"))))
                    .data("generatedAt", Instant.now().toString())
                    .data("disclaimer", nullToDash(asString(snapshot.get("disclaimer"))))
                    .render();

            byte[] pdf = htmlToPdf(html);
            String filename = "gruahub-fiscal-stub-" + id + ".pdf";
            return Response.ok(pdf)
                    .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                    .header("Content-Length", pdf.length)
                    .build();
        } catch (Exception e) {
            LOG.errorf(e, "Failed to render fiscal PDF id=%s", id);
            return Response.serverError()
                    .type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("error", "PDF generation failed"))
                    .build();
        }
    }

    private static String asString(Object value) {
        return value == null ? null : value.toString();
    }

    private static String nullToDash(String value) {
        return value == null || value.isBlank() ? "—" : value;
    }

    private static String formatMoney(long cents, String currency) {
        return String.format("%s %.2f", currency == null ? "BRL" : currency, cents / 100.0);
    }

    private static Instant toInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof java.sql.Timestamp ts) {
            return ts.toInstant();
        }
        return Instant.parse(value.toString());
    }

    private byte[] htmlToPdf(String html) throws Exception {
        String xhtml = tidyToXhtml(html);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ITextRenderer renderer = new ITextRenderer();
        renderer.setDocumentFromString(xhtml);
        renderer.layout();
        renderer.createPDF(baos);
        return baos.toByteArray();
    }

    private String tidyToXhtml(String html) {
        Tidy tidy = new Tidy();
        tidy.setXHTML(true);
        tidy.setShowWarnings(false);
        tidy.setShowErrors(0);
        tidy.setQuiet(true);
        tidy.setInputEncoding("UTF-8");
        tidy.setOutputEncoding("UTF-8");
        InputStream in = new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        tidy.parseDOM(in, out);
        return out.toString(StandardCharsets.UTF_8);
    }
}
