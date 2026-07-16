package com.gruahub.payments.infrastructure;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rate limiter para endpoints de webhook de pagamento.
 *
 * Algoritmo: sliding window por chave (IP + provider).
 *  - Máximo: {@value #MAX_REQUESTS} requisições em {@value #WINDOW_SECONDS}s
 *  - Retorna 429 Too Many Requests com header Retry-After quando excedido
 *
 * Implementado em memória (suficiente para MVP monolítico em instância única).
 * Para escala horizontal, substituir por Redis/Infinispan.
 *
 * Thread-safety: {@link ConcurrentHashMap} + {@code synchronized} por bucket.
 */
@Provider
@ApplicationScoped
@Priority(Priorities.AUTHENTICATION - 10)   // antes da autenticação: rejeita early
public class WebhookRateLimitFilter implements ContainerRequestFilter {

    private static final Logger LOG = Logger.getLogger(WebhookRateLimitFilter.class);

    /** Número máximo de requisições por janela */
    private static final int MAX_REQUESTS = 30;

    /** Duração da janela deslizante em segundos */
    private static final long WINDOW_SECONDS = 60;

    /** Prefixo de path que este filtro protege */
    private static final String WEBHOOK_PATH_PREFIX = "/api/v1/payments/webhook/";

    /**
     * Mapa de buckets por chave (IP + provider).
     * Cada bucket é uma deque de timestamps (epoch seconds) das requisições recentes.
     */
    private final ConcurrentHashMap<String, Deque<Long>> buckets = new ConcurrentHashMap<>();

    @Override
    public void filter(ContainerRequestContext ctx) {
        String path = ctx.getUriInfo().getPath();

        // Aplicar apenas para endpoints de webhook
        if (!path.startsWith(WEBHOOK_PATH_PREFIX) &&
            !path.startsWith("api/v1/payments/webhook/")) {
            return;
        }

        String ip = extractIp(ctx);
        String provider = extractProvider(path);
        String key = ip + "|" + provider;

        if (isRateLimited(key)) {
            LOG.warnf("Rate limit exceeded for webhook key=%s", key);
            ctx.abortWith(Response.status(429)
                .header("Retry-After", String.valueOf(WINDOW_SECONDS))
                .header("X-RateLimit-Limit", String.valueOf(MAX_REQUESTS))
                .header("X-RateLimit-Window-Seconds", String.valueOf(WINDOW_SECONDS))
                .entity("{\"error\":\"Too many webhook requests. Please wait before retrying.\"}")
                .type("application/json")
                .build());
        }
    }

    /**
     * Desliza a janela e verifica o limite.
     * @return true se o limite foi excedido (deve bloquear)
     */
    private boolean isRateLimited(String key) {
        long now = Instant.now().getEpochSecond();
        long cutoff = now - WINDOW_SECONDS;

        Deque<Long> bucket = buckets.computeIfAbsent(key, k -> new ArrayDeque<>());

        synchronized (bucket) {
            // Remove timestamps fora da janela
            while (!bucket.isEmpty() && bucket.peekFirst() <= cutoff) {
                bucket.pollFirst();
            }

            if (bucket.size() >= MAX_REQUESTS) {
                return true; // bloqueado
            }

            bucket.addLast(now);
            return false;
        }
    }

    /**
     * Extrai o IP real, respeitando X-Forwarded-For quando atrás de proxy confiável.
     * Em produção, configure {@code quarkus.http.proxy.proxy-address-forwarding=true}
     * e valide que o header vem apenas de um proxy confiável.
     */
    private String extractIp(ContainerRequestContext ctx) {
        String xff = ctx.getHeaderString("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            // Primeiro IP da cadeia é o cliente original
            return xff.split(",")[0].trim();
        }
        // Fallback: não há como obter o IP real via JAX-RS puro sem @Context HttpServletRequest
        // No Quarkus, @Context jakarta.servlet.http.HttpServletRequest também funciona mas
        // adiciona dependência de Servlet. Usamos header como fallback seguro para MVP.
        return "unknown";
    }

    private String extractProvider(String path) {
        // Path: /api/v1/payments/webhook/SANDBOX → SANDBOX
        int idx = path.lastIndexOf('/');
        return idx >= 0 ? path.substring(idx + 1) : "unknown";
    }
}
