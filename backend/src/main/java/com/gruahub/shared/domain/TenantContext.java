package com.gruahub.shared.domain;

import java.util.UUID;

/** Tenant do JWT — nunca do cliente HTTP como autorização. */
public final class TenantContext {

    private TenantContext() {}

    private static final ThreadLocal<UUID> TENANT_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> TENANT_SLUG = new ThreadLocal<>();
    private static final ThreadLocal<String> USER_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> USER_EMAIL = new ThreadLocal<>();

    public static void set(UUID tenantId, String tenantSlug, String userId, String userEmail) {
        TENANT_ID.set(tenantId);
        TENANT_SLUG.set(tenantSlug);
        USER_ID.set(userId);
        USER_EMAIL.set(userEmail);
    }

    public static UUID getTenantId() {
        UUID id = TENANT_ID.get();
        if (id == null) {
            throw new IllegalStateException("TenantContext not initialized for this thread");
        }
        return id;
    }

    public static String getTenantSlug() {
        return TENANT_SLUG.get();
    }

    public static String getUserId() {
        return USER_ID.get();
    }

    public static String getUserEmail() {
        return USER_EMAIL.get();
    }

    public static boolean isInitialized() {
        return TENANT_ID.get() != null;
    }

    public static void clear() {
        TENANT_ID.remove();
        TENANT_SLUG.remove();
        USER_ID.remove();
        USER_EMAIL.remove();
    }
}
