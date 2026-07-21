package com.gruahub.fiscal.domain;

import java.util.Locale;
import java.util.Set;

public enum FiscalDocumentStatus {
    DRAFT,
    ISSUED_STUB,
    CANCELLED;

    public static FiscalDocumentStatus from(String value) {
        return FiscalDocumentStatus.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }

    public boolean canTransitionTo(FiscalDocumentStatus target) {
        return switch (this) {
            case DRAFT -> target == ISSUED_STUB || target == CANCELLED;
            case ISSUED_STUB -> target == CANCELLED;
            case CANCELLED -> false;
        };
    }

    public static Set<String> names() {
        return Set.of(DRAFT.name(), ISSUED_STUB.name(), CANCELLED.name());
    }
}
