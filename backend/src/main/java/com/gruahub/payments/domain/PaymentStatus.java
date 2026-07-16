package com.gruahub.payments.domain;

import java.util.Set;

public enum PaymentStatus {
    CREATED,
    PENDING,
    CONFIRMED,
    FAILED,
    CANCELLED,
    REFUNDED,
    EXPIRED;

    private static final java.util.Map<PaymentStatus, Set<PaymentStatus>> TRANSITIONS =
            new java.util.EnumMap<>(PaymentStatus.class);

    static {
        TRANSITIONS.put(CREATED, Set.of(PENDING, CONFIRMED, FAILED, CANCELLED, EXPIRED));
        TRANSITIONS.put(PENDING, Set.of(CONFIRMED, FAILED, CANCELLED, EXPIRED));
        TRANSITIONS.put(CONFIRMED, Set.of(REFUNDED));
        TRANSITIONS.put(FAILED, Set.of());
        TRANSITIONS.put(CANCELLED, Set.of());
        TRANSITIONS.put(REFUNDED, Set.of());
        TRANSITIONS.put(EXPIRED, Set.of());
    }

    public boolean canTransitionTo(PaymentStatus target) {
        return TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }

    public PaymentStatus transitionTo(PaymentStatus target) {
        if (!canTransitionTo(target)) {
            throw new IllegalStateException(
                    "Invalid payment status transition: " + this + " → " + target);
        }
        return target;
    }

    public boolean isTerminal() {
        return TRANSITIONS.getOrDefault(this, Set.of()).isEmpty();
    }
}
