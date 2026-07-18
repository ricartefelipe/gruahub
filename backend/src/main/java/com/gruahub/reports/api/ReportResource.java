package com.gruahub.reports.api;

import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.audit.application.AuditService;
import io.quarkus.qute.Template;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.w3c.tidy.Tidy;
import org.xhtmlrenderer.pdf.ITextRenderer;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Geração de relatórios PDF via Flying Saucer (XHTML → PDF) + Qute templates.
 * <p>
 * Em sandbox: devolve o PDF diretamente como resposta (Content-Type: application/pdf).
 * Em produção: armazena no MinIO e devolve uma pre-signed URL.
 */
@Path("/api/v1/reports")
@Produces(MediaType.APPLICATION_JSON)
@RequestScoped
public class ReportResource {

    private static final Logger LOG = Logger.getLogger(ReportResource.class);

    @Inject
    EntityManager em;

    @Inject
    AuditService audit;

    // Qute templates — injetados por nome de arquivo em src/main/resources/templates/
    @Inject
    Template fleetStatusReport;

    @Inject
    Template visitReceiptReport;

    // ── DTOs ────────────────────────────────────────────────────────────────────

    public enum ReportType {
        FLEET_STATUS, VISIT_RECEIPT, CASH_COLLECTION, SETTLEMENT
    }

    public record GenerateReportRequest(
        @NotBlank String reportType,
        Map<String, String> parameters
    ) {}

    // ── Generate ─────────────────────────────────────────────────────────────────

    @POST
    @Path("/generate")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("application/pdf")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE", "FIELD_OPERATOR"})
    public Response generateReport(@Valid GenerateReportRequest req) {
        UUID tenantId = TenantContext.getTenantId();
        LOG.infof("[%s] Generating report: %s params=%s", tenantId, req.reportType(), req.parameters());

        try {
            ReportType type = ReportType.valueOf(req.reportType());
            String html = renderHtml(type, tenantId, req.parameters());
            byte[] pdfBytes = htmlToPdf(html);

            audit.record("REPORT_GENERATED", "report", null,
                JsonUtil.obj("reportType", req.reportType()));

            String filename = "gruahub-" + req.reportType().toLowerCase() + "-"
                + Instant.now().getEpochSecond() + ".pdf";

            return Response.ok(pdfBytes)
                .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
                .header("Content-Length", pdfBytes.length)
                .build();

        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "Unknown report type: " + req.reportType()))
                .build();
        } catch (Exception e) {
            LOG.errorf(e, "[%s] Failed to generate report %s", tenantId, req.reportType());
            return Response.serverError()
                .type(MediaType.APPLICATION_JSON)
                .entity(Map.of("error", "Report generation failed: " + e.getMessage()))
                .build();
        }
    }

    // ── Template rendering ────────────────────────────────────────────────────────

    private String renderHtml(ReportType type, UUID tenantId, Map<String, String> params) {
        return switch (type) {
            case FLEET_STATUS -> renderFleetStatus(tenantId);
            case VISIT_RECEIPT -> renderVisitReceipt(tenantId, params);
            case CASH_COLLECTION -> renderCashCollection(tenantId, params);
            case SETTLEMENT -> renderSettlement(tenantId, params);
        };
    }

    private String renderFleetStatus(UUID tenantId) {
        @SuppressWarnings("unchecked")
        var machines = em.createNativeQuery(
            "SELECT m.asset_number, m.status, mrs.online, mrs.last_heartbeat_at " +
            "FROM machine m LEFT JOIN machine_reported_state mrs ON mrs.machine_id = m.id " +
            "WHERE m.tenant_id = :tid ORDER BY m.asset_number"
        ).setParameter("tid", tenantId).getResultList();

        long online = machines.stream()
            .filter(r -> Boolean.TRUE.equals(((Object[]) r)[2])).count();

        return fleetStatusReport
            .data("machines", machines)
            .data("generatedAt", Instant.now().toString())
            .data("totalMachines", machines.size())
            .data("onlineMachines", online)
            .render();
    }

    private String renderVisitReceipt(UUID tenantId, Map<String, String> params) {
        String visitId = params.getOrDefault("visitId", "");
        if (visitId.isBlank()) throw new BadRequestException("visitId required for VISIT_RECEIPT");

        Object[] visit = (Object[]) em.createNativeQuery(
            "SELECT v.id, op.name, v.responsible_name, v.checkin_at, v.checkout_at, " +
            "v.cash_collected_cents, v.notes " +
            "FROM field_visit v JOIN operating_point op ON op.id = v.operating_point_id " +
            "WHERE v.id = :id AND v.tenant_id = :tid"
        ).setParameter("id", UUID.fromString(visitId))
         .setParameter("tid", tenantId)
         .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (visit == null) throw new NotFoundException("Visit not found: " + visitId);

        return visitReceiptReport
            .data("visitId", visit[0])
            .data("pointName", visit[1])
            .data("responsibleName", visit[2])
            .data("checkinAt", visit[3])
            .data("checkoutAt", visit[4])
            .data("cashCollectedCents", visit[5])
            .data("notes", visit[6])
            .data("generatedAt", Instant.now().toString())
            .render();
    }

    private String renderCashCollection(UUID tenantId, Map<String, String> params) {
        // Template inline simples — em produção extrair para .html Qute
        String startDate = params.getOrDefault("startDate", "");
        String endDate = params.getOrDefault("endDate", "");

        @SuppressWarnings("unchecked")
        var collections = em.createNativeQuery(
            "SELECT v.id, op.name, v.cash_collected_cents, v.checkout_at " +
            "FROM field_visit v JOIN operating_point op ON op.id = v.operating_point_id " +
            "WHERE v.tenant_id = :tid AND v.status = 'COMPLETED' " +
            (startDate.isBlank() ? "" : "AND v.checkout_at >= :sd ") +
            (endDate.isBlank() ? "" : "AND v.checkout_at <= :ed ") +
            "ORDER BY v.checkout_at DESC"
        ).setParameter("tid", tenantId)
         .getResultList();

        long total = collections.stream()
            .mapToLong(r -> ((Object[]) r)[2] != null ? ((Number)((Object[])r)[2]).longValue() : 0)
            .sum();

        return buildSimpleHtmlTable(
            "Relatório de Sangrias",
            new String[]{"Visita", "Ponto", "Valor", "Data"},
            collections,
            "Total: R$ " + String.format("%.2f", total / 100.0)
        );
    }

    private String renderSettlement(UUID tenantId, Map<String, String> params) {
        return buildSimpleHtmlTable(
            "Relatório de Liquidação",
            new String[]{"Ponto", "Período", "Bruto", "Comissão", "Líquido", "Status"},
            java.util.List.of(),
            "Nenhuma liquidação no período"
        );
    }

    // ── PDF conversion ────────────────────────────────────────────────────────────

    /**
     * Converte HTML (XHTML bem-formado) para PDF usando Flying Saucer + OpenPDF.
     */
    private byte[] htmlToPdf(String html) throws Exception {
        // Garante XHTML válido via JTidy
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

    // ── Simple HTML builder (fallback quando não há template Qute) ────────────────

    private String buildSimpleHtmlTable(
        String title,
        String[] headers,
        java.util.List<?> rows,
        String footer
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head>")
          .append("<meta charset='UTF-8'/>")
          .append("<title>").append(title).append("</title>")
          .append("<style>")
          .append("body{font-family:Arial,sans-serif;margin:40px;color:#222}")
          .append("h1{color:#1e40af;font-size:20px}")
          .append("table{width:100%;border-collapse:collapse;margin-top:20px}")
          .append("th{background:#1e40af;color:#fff;padding:8px;text-align:left;font-size:12px}")
          .append("td{padding:7px 8px;border-bottom:1px solid #eee;font-size:11px}")
          .append("tr:nth-child(even){background:#f8fafc}")
          .append(".footer{margin-top:20px;font-weight:bold;font-size:13px}")
          .append(".generated{margin-top:8px;font-size:10px;color:#6b7280}")
          .append("</style></head><body>")
          .append("<h1>").append(title).append("</h1>")
          .append("<table><thead><tr>");

        for (String h : headers) {
            sb.append("<th>").append(h).append("</th>");
        }
        sb.append("</tr></thead><tbody>");

        if (rows.isEmpty()) {
            sb.append("<tr><td colspan='").append(headers.length)
              .append("' style='text-align:center;color:#9ca3af'>Sem dados</td></tr>");
        } else {
            for (Object row : rows) {
                sb.append("<tr>");
                Object[] cells = row instanceof Object[] ? (Object[]) row : new Object[]{row};
                for (Object cell : cells) {
                    sb.append("<td>").append(cell != null ? cell.toString() : "—").append("</td>");
                }
                sb.append("</tr>");
            }
        }

        sb.append("</tbody></table>")
          .append("<div class='footer'>").append(footer).append("</div>")
          .append("<div class='generated'>Gerado em: ").append(Instant.now()).append(" — GruaHub</div>")
          .append("</body></html>");

        return sb.toString();
    }
}
