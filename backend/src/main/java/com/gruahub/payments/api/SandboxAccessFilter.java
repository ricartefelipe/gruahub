package com.gruahub.payments.api;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Set;

@Provider
@SandboxEndpoint
@Priority(Priorities.AUTHORIZATION)
public class SandboxAccessFilter implements ContainerRequestFilter {

    private static final Set<String> ALLOWED_ROLES = Set.of(
            "PLATFORM_ADMIN", "TENANT_ADMIN", "FINANCE");

    @ConfigProperty(name = "gruahub.sandbox.enabled", defaultValue = "false")
    boolean sandboxEnabled;

    @ConfigProperty(name = "gruahub.sandbox.secret", defaultValue = "sandbox-webhook-secret-gruahub-demo")
    String sandboxSecret;

    @Inject
    SecurityIdentity identity;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        if (!sandboxEnabled) {
            requestContext.abortWith(Response.status(Response.Status.NOT_FOUND).build());
            return;
        }

        if (hasValidSandboxSecret(requestContext.getHeaderString("X-Sandbox-Secret"))) {
            return;
        }

        if (identity != null && !identity.isAnonymous() && hasAllowedRole()) {
            return;
        }

        requestContext.abortWith(Response.status(Response.Status.UNAUTHORIZED)
                .entity(Map.of("error", "Sandbox access requires authentication or X-Sandbox-Secret"))
                .build());
    }

    private boolean hasAllowedRole() {
        for (String role : ALLOWED_ROLES) {
            if (identity.hasRole(role)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasValidSandboxSecret(String provided) {
        if (provided == null || provided.isBlank() || sandboxSecret == null || sandboxSecret.isBlank()) {
            return false;
        }
        byte[] expected = sandboxSecret.getBytes(StandardCharsets.UTF_8);
        byte[] actual = provided.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }
}
