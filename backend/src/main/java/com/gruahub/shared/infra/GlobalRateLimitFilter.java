package com.gruahub.shared.infra;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

@Provider
@ApplicationScoped
@Priority(Priorities.AUTHENTICATION - 20)
public class GlobalRateLimitFilter implements ContainerRequestFilter {

    private static final Logger LOG = Logger.getLogger(GlobalRateLimitFilter.class);

    @ConfigProperty(name = "gruahub.rate-limit.global.enabled", defaultValue = "true")
    boolean enabled;

    @ConfigProperty(name = "gruahub.rate-limit.global.max-requests", defaultValue = "300")
    int maxRequests;

    @ConfigProperty(name = "gruahub.rate-limit.global.window-seconds", defaultValue = "60")
    long windowSeconds;

    @Inject
    RateLimitService rateLimitService;

    @Inject
    ClientIpResolver clientIpResolver;

    @Override
    public void filter(ContainerRequestContext ctx) {
        if (!enabled) {
            return;
        }

        String path = normalize(ctx.getUriInfo().getPath());
        if (!isApiPath(path)) {
            return;
        }

        String key = "global|" + clientIpResolver.resolve(ctx);
        if (!rateLimitService.tryAcquire(key, maxRequests, windowSeconds)) {
            LOG.warnf("Global rate limit exceeded for key=%s", key);
            ctx.abortWith(Response.status(429)
                .header("Retry-After", String.valueOf(windowSeconds))
                .header("X-RateLimit-Limit", String.valueOf(maxRequests))
                .header("X-RateLimit-Window-Seconds", String.valueOf(windowSeconds))
                .entity("{\"error\":\"Too many requests. Please wait before retrying.\"}")
                .type("application/json")
                .build());
        }
    }

    private static boolean isApiPath(String path) {
        return path.startsWith("api/");
    }

    private static String normalize(String path) {
        if (path == null) {
            return "";
        }
        return path.startsWith("/") ? path.substring(1) : path;
    }
}
