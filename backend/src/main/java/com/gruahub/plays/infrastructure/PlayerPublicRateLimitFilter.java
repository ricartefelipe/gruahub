package com.gruahub.plays.infrastructure;

import com.gruahub.shared.infra.ClientIpResolver;
import com.gruahub.shared.infra.RateLimitService;
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
@Priority(Priorities.AUTHENTICATION - 10)
public class PlayerPublicRateLimitFilter implements ContainerRequestFilter {

    private static final Logger LOG = Logger.getLogger(PlayerPublicRateLimitFilter.class);
    private static final String PUBLIC_PREFIX = "api/v1/public/";

    @ConfigProperty(name = "gruahub.rate-limit.player-public.max-requests", defaultValue = "40")
    int maxRequests;

    @ConfigProperty(name = "gruahub.rate-limit.player-public.window-seconds", defaultValue = "60")
    long windowSeconds;

    @Inject
    RateLimitService rateLimitService;

    @Inject
    ClientIpResolver clientIpResolver;

    @Override
    public void filter(ContainerRequestContext ctx) {
        String path = normalize(ctx.getUriInfo().getPath());
        if (!path.startsWith(PUBLIC_PREFIX)) {
            return;
        }

        String key = clientIpResolver.resolve(ctx) + "|player-public";
        if (!rateLimitService.tryAcquire(key, maxRequests, windowSeconds)) {
            LOG.warnf("Player public rate limit exceeded for key=%s", key);
            ctx.abortWith(Response.status(429)
                    .header("Retry-After", String.valueOf(windowSeconds))
                    .header("X-RateLimit-Limit", String.valueOf(maxRequests))
                    .header("X-RateLimit-Window-Seconds", String.valueOf(windowSeconds))
                    .entity("{\"error\":\"Too many requests. Please wait before retrying.\"}")
                    .type("application/json")
                    .build());
        }
    }

    private static String normalize(String path) {
        if (path == null) {
            return "";
        }
        return path.startsWith("/") ? path.substring(1) : path;
    }
}
