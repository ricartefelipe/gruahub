package com.gruahub.plays.application;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.ws.rs.NotFoundException;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@ApplicationScoped
public class PlayerMachineLookup {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            Pattern.CASE_INSENSITIVE
    );

    public record PublicMachine(
            UUID id,
            UUID tenantId,
            String name,
            String assetNumber,
            String qrCode,
            long playPriceCents,
            String currency,
            String status
    ) {}

    @Inject
    EntityManager em;

    public PublicMachine resolve(String rawToken) {
        String token = normalizeToken(rawToken);
        if (token.isBlank()) {
            throw new NotFoundException("Machine not found");
        }

        Object[] row;
        if (UUID_PATTERN.matcher(token).matches()) {
            row = findById(UUID.fromString(token));
        } else {
            row = findByQrOrAsset(token);
        }

        if (row == null) {
            throw new NotFoundException("Machine not found");
        }

        String status = row[7].toString();
        if (!"ACTIVE".equals(status)) {
            throw new NotFoundException("Machine not available");
        }

        return new PublicMachine(
                UUID.fromString(row[0].toString()),
                UUID.fromString(row[1].toString()),
                row[2] == null ? null : row[2].toString(),
                row[3] == null ? null : row[3].toString(),
                row[4] == null ? null : row[4].toString(),
                ((Number) row[5]).longValue(),
                row[6] == null ? "BRL" : row[6].toString(),
                status
        );
    }

    private Object[] findById(UUID id) {
        return singleOrNull(em.createNativeQuery(
                "SELECT id, tenant_id, name, asset_number, qr_code, play_price_cents, currency, status " +
                "FROM machine WHERE id = :id")
                .setParameter("id", id)
                .getResultList());
    }

    private Object[] findByQrOrAsset(String token) {
        return singleOrNull(em.createNativeQuery(
                "SELECT id, tenant_id, name, asset_number, qr_code, play_price_cents, currency, status " +
                "FROM machine " +
                "WHERE LOWER(qr_code) = :token OR LOWER(asset_number) = :token " +
                "ORDER BY created_at ASC LIMIT 1")
                .setParameter("token", token.toLowerCase(Locale.ROOT))
                .getResultList());
    }

    private static Object[] singleOrNull(List<?> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        return (Object[]) rows.get(0);
    }

    public static String normalizeToken(String raw) {
        if (raw == null) {
            return "";
        }
        String token = raw.trim();
        try {
            java.net.URI uri = java.net.URI.create(token);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            String path = uri.getPath() == null ? "" : uri.getPath();
            String host = uri.getHost() == null ? "" : uri.getHost();

            if ("gruahub".equalsIgnoreCase(scheme)) {
                if (path.startsWith("//machine/")) {
                    return path.substring("//machine/".length());
                }
                if ("machine".equalsIgnoreCase(host) && path.length() > 1) {
                    return path.substring(1);
                }
                if (path.startsWith("/machine/")) {
                    return path.substring("/machine/".length());
                }
            }

            if (("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && path.contains("/play/")) {
                int idx = path.lastIndexOf("/play/");
                String playToken = path.substring(idx + "/play/".length());
                int slash = playToken.indexOf('/');
                if (slash >= 0) {
                    playToken = playToken.substring(0, slash);
                }
                if (!playToken.isBlank()) {
                    return java.net.URLDecoder.decode(playToken, java.nio.charset.StandardCharsets.UTF_8);
                }
            }
        } catch (Exception ignored) {
            // plain token
        }
        if (token.startsWith("gruahub://machine/")) {
            return token.substring("gruahub://machine/".length());
        }
        int playIdx = token.lastIndexOf("/play/");
        if (playIdx >= 0) {
            String playToken = token.substring(playIdx + "/play/".length());
            int q = playToken.indexOf('?');
            if (q >= 0) {
                playToken = playToken.substring(0, q);
            }
            int slash = playToken.indexOf('/');
            if (slash >= 0) {
                playToken = playToken.substring(0, slash);
            }
            if (!playToken.isBlank()) {
                return java.net.URLDecoder.decode(playToken, java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return token;
    }
}
