package com.gruahub.fieldops.api;

import com.gruahub.audit.application.AuditService;
import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.shared.infra.ObjectStorageService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Anexos de visita (fotos de evidência) — armazenados no MinIO/S3.
 * Idempotente via client_operation_id.
 */
@Path("/api/v1/visits/{visitId}/attachments")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class VisitAttachmentResource {

    private static final Logger LOG = Logger.getLogger(VisitAttachmentResource.class);
    private static final int MAX_BYTES = 8 * 1024 * 1024;

    @Inject
    EntityManager em;

    @Inject
    ObjectStorageService storage;

    @Inject
    AuditService audit;

    public record UploadAttachmentRequest(
        @NotNull UUID clientOperationId,
        @NotBlank String base64Data,
        String contentType,
        String filename,
        String attachmentType,
        UUID machineId
    ) {}

    public record AttachmentResponse(
        UUID id,
        UUID fieldVisitId,
        String attachmentType,
        String s3Key,
        String originalFilename,
        String contentType,
        long sizeBytes,
        String clientOperationId
    ) {}

    @POST
    @Transactional
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR"})
    public Response upload(
        @PathParam("visitId") UUID visitId,
        @Valid UploadAttachmentRequest req
    ) {
        UUID tenantId = TenantContext.getTenantId();
        String clientOpId = req.clientOperationId().toString();

        Long dup = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM visit_attachment WHERE tenant_id = :tid AND client_operation_id = :coid"
        )
            .setParameter("tid", tenantId)
            .setParameter("coid", clientOpId)
            .getSingleResult();
        if (dup != null && dup > 0) {
            return Response.status(Response.Status.CONFLICT)
                .entity(Map.of("message", "Operation already processed", "clientOperationId", clientOpId))
                .build();
        }

        Long visitExists = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM field_visit WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("id", visitId)
            .setParameter("tid", tenantId)
            .getSingleResult();
        if (visitExists == null || visitExists == 0) {
            throw new NotFoundException("Visit not found: " + visitId);
        }

        byte[] bytes;
        try {
            String raw = req.base64Data();
            int comma = raw.indexOf(',');
            if (raw.startsWith("data:") && comma > 0) {
                raw = raw.substring(comma + 1);
            }
            bytes = Base64.getDecoder().decode(raw);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("base64Data inválido");
        }
        if (bytes.length == 0) {
            throw new BadRequestException("arquivo vazio");
        }
        if (bytes.length > MAX_BYTES) {
            throw new BadRequestException("arquivo excede 8MB");
        }

        UUID attachmentId = UUID.randomUUID();
        String contentType = req.contentType() != null && !req.contentType().isBlank()
            ? req.contentType()
            : "image/jpeg";
        String filename = req.filename() != null && !req.filename().isBlank()
            ? req.filename()
            : "evidence.jpg";
        String attachmentType = req.attachmentType() != null && !req.attachmentType().isBlank()
            ? req.attachmentType()
            : "VISIT_EVIDENCE";
        String s3Key = tenantId + "/visits/" + visitId + "/" + attachmentId + "-" + sanitize(filename);

        storage.put(s3Key, bytes, contentType);

        em.createNativeQuery(
            "INSERT INTO visit_attachment " +
            "(id, tenant_id, field_visit_id, machine_id, attachment_type, s3_key, " +
            " original_filename, content_type, size_bytes, client_operation_id) " +
            "VALUES (:id, :tid, :vid, :mid, :atype, :s3, :fname, :ctype, :size, :coid)"
        )
            .setParameter("id", attachmentId)
            .setParameter("tid", tenantId)
            .setParameter("vid", visitId)
            .setParameter("mid", req.machineId())
            .setParameter("atype", attachmentType)
            .setParameter("s3", s3Key)
            .setParameter("fname", filename)
            .setParameter("ctype", contentType)
            .setParameter("size", (long) bytes.length)
            .setParameter("coid", clientOpId)
            .executeUpdate();

        audit.record(
            "VISIT_ATTACHMENT_UPLOADED",
            "visit_attachment",
            attachmentId.toString(),
            JsonUtil.obj("visitId", visitId.toString(), "s3Key", s3Key)
        );

        LOG.infof("[%s] attachment uploaded visit=%s id=%s bytes=%d", tenantId, visitId, attachmentId, bytes.length);

        return Response.status(Response.Status.CREATED)
            .entity(new AttachmentResponse(
                attachmentId, visitId, attachmentType, s3Key, filename, contentType, bytes.length, clientOpId
            ))
            .build();
    }

    @GET
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "OPERATIONS_MANAGER", "FINANCE"})
    public List<AttachmentResponse> list(@PathParam("visitId") UUID visitId) {
        UUID tenantId = TenantContext.getTenantId();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT id, field_visit_id, attachment_type, s3_key, original_filename, content_type, " +
            "size_bytes, client_operation_id " +
            "FROM visit_attachment WHERE tenant_id = :tid AND field_visit_id = :vid " +
            "ORDER BY created_at DESC"
        )
            .setParameter("tid", tenantId)
            .setParameter("vid", visitId)
            .getResultList();

        return rows.stream().map(r -> new AttachmentResponse(
            (UUID) r[0],
            (UUID) r[1],
            (String) r[2],
            (String) r[3],
            (String) r[4],
            (String) r[5],
            r[6] != null ? ((Number) r[6]).longValue() : 0L,
            (String) r[7]
        )).toList();
    }

    private static String sanitize(String filename) {
        return filename.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
