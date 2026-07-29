package com.gruahub.identity.domain;

public enum UserRole {
    PLATFORM_ADMIN,
    TENANT_ADMIN,
    OPERATIONS_MANAGER,
    FIELD_OPERATOR,
    TECHNICIAN,
    FINANCE,
    ESTABLISHMENT_VIEWER;

    public boolean canManageTenant() {
        return this == PLATFORM_ADMIN || this == TENANT_ADMIN;
    }

    public boolean canViewFinancials() {
        return this == PLATFORM_ADMIN || this == TENANT_ADMIN
                || this == OPERATIONS_MANAGER || this == FINANCE;
    }

    public boolean canDoFieldOps() {
        return this == FIELD_OPERATOR || this == TECHNICIAN
                || this == TENANT_ADMIN || this == OPERATIONS_MANAGER;
    }

    public boolean canSendCommands() {
        return this == PLATFORM_ADMIN || this == TENANT_ADMIN
                || this == OPERATIONS_MANAGER || this == TECHNICIAN;
    }
}
