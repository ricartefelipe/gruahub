package com.gruahub.payments.infrastructure;

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
public class WebhookRateLimitFilter implements ContainerRequestFilter {

    private static final Logger LOG = Logger.getLogger(WebhookRateLimitFilter.class);

    private static final String WEBHOOK_PREFIX = "api/v1/payments/webhook/";
    private static final String SANDBOX_PREFIX = "api/v1/payments/sandbox/";

    @ConfigProperty(name = "gruahub.rate-limit.webhook.max-requests", defaultValue = "30")
    int webhookMaxRequests;

    @ConfigProperty(name = "gruahub.rate-limit.sandbox.max-requests", defaultValue = "60")
    int sandboxMaxRequests;

    @ConfigProperty(name = "gruahub.rate-limit.window-seconds", defaultValue = "60")
    long windowSeconds;

    @Inject
    RateLimitService rateLimitService;

    @Inject
    ClientIpResolver clientIpResolver;

    @Override
    public void filter(ContainerRequestContext ctx) {
        String path = normalize(ctx.getUriInfo().getPath());
        int limit;
        String bucketKind;

        if (path.startsWith(WEBHOOK_PREFIX)) {
            limit = webhookMaxRequests;
            bucketKind = "webhook|" + extractTail(path);
        } else if (path.startsWith(SANDBOX_PREFIX)) {
            limit = sandboxMaxRequests;
            bucketKind = "sandbox";
        } else {
            return;
        }

        String key = clientIpResolver.resolve(ctx) + "|" + bucketKind;
        if (!rateLimitService.tryAcquire(key, limit, windowSeconds)) {
            LOG.warnf("Rate limit exceeded for key=%s", key);
            ctx.abortWith(Response.status(429)
                .header("Retry-After", String.valueOf(windowSeconds))
                .header("X-RateLimit-Limit", String.valueOf(limit))
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

    private static String extractTail(String path) {
        int idx = path.lastIndexOf('/');
        return idx >= 0 ? path.substring(idx + 1) : "unknown";
    }
}
