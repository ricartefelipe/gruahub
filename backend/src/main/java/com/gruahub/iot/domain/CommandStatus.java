package com.gruahub.iot.domain;

import java.util.Set;

public enum CommandStatus {
    PENDING,
    PUBLISHED,
    DELIVERED,
    EXECUTED,
    REJECTED,
    FAILED,
    EXPIRED;

    private static final java.util.Map<CommandStatus, Set<CommandStatus>> TRANSITIONS =
            new java.util.EnumMap<>(CommandStatus.class);

    static {
        TRANSITIONS.put(PENDING, Set.of(PUBLISHED, FAILED, EXPIRED));
        TRANSITIONS.put(PUBLISHED, Set.of(DELIVERED, FAILED, EXPIRED));
        TRANSITIONS.put(DELIVERED, Set.of(EXECUTED, REJECTED, EXPIRED));
        TRANSITIONS.put(EXECUTED, Set.of());
        TRANSITIONS.put(REJECTED, Set.of());
        TRANSITIONS.put(FAILED, Set.of());
        TRANSITIONS.put(EXPIRED, Set.of());
    }

    public boolean canTransitionTo(CommandStatus target) {
        return TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }
}
