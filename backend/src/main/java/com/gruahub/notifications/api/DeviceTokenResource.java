package com.gruahub.notifications.api;

import com.gruahub.shared.domain.TenantContext;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.Map;
import java.util.UUID;

@Path("/api/v1/devices/push-tokens")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RequestScoped
public class DeviceTokenResource {

    @Inject
    EntityManager em;

    public record RegisterTokenRequest(
        @NotBlank String token,
        @NotBlank String platform
    ) {}

    @POST
    @Transactional
    @RolesAllowed({
        "PLATFORM_ADMIN", "TENANT_ADMIN", "FIELD_OPERATOR", "TECHNICIAN",
        "OPERATIONS_MANAGER", "FINANCE"
    })
    public Response register(@Valid RegisterTokenRequest req) {
        UUID tenantId = TenantContext.getTenantId();
        String userId = TenantContext.getUserId();
        if (userId == null || userId.isBlank()) {
            userId = "unknown";
        }

        String platform = req.platform().toLowerCase();
        if (!platform.equals("ios") && !platform.equals("android") && !platform.equals("web")) {
            throw new BadRequestException("platform deve ser ios, android ou web");
        }

        Long existing = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM device_token WHERE tenant_id = :tid AND expo_push_token = :tok"
        )
            .setParameter("tid", tenantId)
            .setParameter("tok", req.token())
            .getSingleResult();

        if (existing != null && existing > 0) {
            em.createNativeQuery(
                "UPDATE device_token SET user_id = :uid, platform = :plat, updated_at = NOW() " +
                "WHERE tenant_id = :tid AND expo_push_token = :tok"
            )
                .setParameter("uid", userId)
                .setParameter("plat", platform)
                .setParameter("tid", tenantId)
                .setParameter("tok", req.token())
                .executeUpdate();
            return Response.ok(Map.of("status", "updated")).build();
        }

        UUID id = UUID.randomUUID();
        em.createNativeQuery(
            "INSERT INTO device_token (id, tenant_id, user_id, expo_push_token, platform) " +
            "VALUES (:id, :tid, :uid, :tok, :plat)"
        )
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("uid", userId)
            .setParameter("tok", req.token())
            .setParameter("plat", platform)
            .executeUpdate();

        return Response.status(Response.Status.CREATED)
            .entity(Map.of("id", id, "status", "created"))
            .build();
    }
}
