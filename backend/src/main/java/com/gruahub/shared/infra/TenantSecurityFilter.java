package com.gruahub.shared.infra;

import com.gruahub.shared.api.ProblemResponse;
import com.gruahub.shared.domain.TenantContext;
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

/** TenantContext do claim JWT tenant_id; PLATFORM_ADMIN pode override verificado. */
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
        // Skip para endpoints públicos (health, metrics, openapi)
        if (identity == null || identity.isAnonymous()) {
            return;
        }

        String subject = null;
        String email = null;
        String tenantIdStr = null;
        String tenantSlug = null;

        try {
            subject = jwt.getSubject();
            email = jwt.getClaim("email");
            tenantIdStr = jwt.getClaim("tenant_id");
            tenantSlug = jwt.getClaim("tenant_slug");
        } catch (Exception e) {
            // JWT não disponível (modo test com @TestSecurity sem OIDC real).
            // Tenta ler tenant de atributos da SecurityIdentity (injetado por TestSecurity).
            try {
                Object attr = identity.getAttribute("tenant_id");
                if (attr != null) tenantIdStr = attr.toString();
                Object slugAttr = identity.getAttribute("tenant_slug");
                if (slugAttr != null) tenantSlug = slugAttr.toString();
                subject = identity.getPrincipal() != null ? identity.getPrincipal().getName() : null;
            } catch (Exception ignored) {
                LOG.debugf("Could not read SecurityIdentity attributes: %s", ignored.getMessage());
            }
        }

        if (tenantIdStr != null && !tenantIdStr.isBlank()) {
            try {
                UUID tenantId = UUID.fromString(tenantIdStr);
                TenantContext.set(tenantId, tenantSlug, subject, email);
            } catch (IllegalArgumentException e) {
                LOG.warnf("Invalid tenant_id claim format for user %s: %s", email, tenantIdStr);
                // ProblemResponse.forbidden() retorna um Response completo
                requestContext.abortWith(ProblemResponse.forbidden(null));
            }
        } else {
            // Usuário autenticado sem tenant_id. Apenas PLATFORM_ADMIN é permitido.
            // Demais perfis obteriam IllegalStateException de TenantContext.getTenantId()
            // e receberiam um 500 inesperado — rejeitamos com 403 aqui.
            boolean isPlatformAdmin = identity.hasRole("PLATFORM_ADMIN");
            if (!isPlatformAdmin) {
                LOG.warnf("Authenticated user %s has no tenant_id claim and is not PLATFORM_ADMIN", email);
                requestContext.abortWith(ProblemResponse.forbidden(null));
            } else {
                LOG.debugf("PLATFORM_ADMIN %s without tenant_id — cross-tenant access", email);
            }
        }
    }

    @Override
    public void filter(ContainerRequestContext requestContext,
                       ContainerResponseContext responseContext) throws IOException {
        TenantContext.clear();
    }
}
