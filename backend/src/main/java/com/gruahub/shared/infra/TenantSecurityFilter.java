package com.gruahub.shared.infra;

import com.gruahub.identity.domain.UserRole;
import com.gruahub.identity.infra.UserRepository;
import com.gruahub.shared.domain.TenantContext;
import io.quarkus.oidc.runtime.OidcJwtCallerPrincipal;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.util.UUID;

/**
 * Inicializa TenantContext a partir do JWT.
 * O tenant_id vem do claim "tenant_id" no JWT (configurado no Keycloak como client claim).
 * Fallback para PLATFORM_ADMIN: usa tenant do path param ou header, verificado no backend.
 */
@Provider
@ApplicationScoped
@Priority(Priorities.AUTHORIZATION + 1)
public class TenantSecurityFilter implements ContainerRequestFilter, ContainerResponseFilter {

    private static final Logger LOG = Logger.getLogger(TenantSecurityFilter.class);

    @Inject
    SecurityIdentity identity;

    @Inject
    JsonWebToken jwt;

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        // Skip para endpoints públicos
        if (identity == null || identity.isAnonymous()) {
            return;
        }

        try {
            String subject = jwt.getSubject(); // Keycloak UUID
            String email = jwt.getClaim("email");

            // Claim customizado configurado no Keycloak
            String tenantIdStr = jwt.getClaim("tenant_id");
            String tenantSlug = jwt.getClaim("tenant_slug");

            if (tenantIdStr != null && !tenantIdStr.isBlank()) {
                UUID tenantId = UUID.fromString(tenantIdStr);
                TenantContext.set(tenantId, tenantSlug, subject, email);
            } else {
                // PLATFORM_ADMIN pode não ter tenant_id no token
                // Será validado nos recursos individualmente
                LOG.debugf("No tenant_id claim for user %s — may be PLATFORM_ADMIN", email);
            }
        } catch (Exception e) {
            LOG.warnf("Failed to initialize TenantContext: %s", e.getMessage());
        }
    }

    @Override
    public void filter(ContainerRequestContext requestContext,
                       ContainerResponseContext responseContext) throws IOException {
        TenantContext.clear();
    }
}
