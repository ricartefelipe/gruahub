package com.gruahub.fleet.domain;

import java.util.Set;

/**
 * State machine do status operacional da máquina.
 */
public enum MachineStatus {
    DRAFT,
    ACTIVE,
    OFFLINE,
    MAINTENANCE,
    DISABLED,
    RETIRED;

    private static final java.util.Map<MachineStatus, Set<MachineStatus>> TRANSITIONS =
            new java.util.EnumMap<>(MachineStatus.class);

    static {
        TRANSITIONS.put(DRAFT, Set.of(ACTIVE, DISABLED));
        TRANSITIONS.put(ACTIVE, Set.of(OFFLINE, MAINTENANCE, DISABLED, RETIRED));
        TRANSITIONS.put(OFFLINE, Set.of(ACTIVE, MAINTENANCE, DISABLED, RETIRED));
        TRANSITIONS.put(MAINTENANCE, Set.of(ACTIVE, OFFLINE, DISABLED, RETIRED));
        TRANSITIONS.put(DISABLED, Set.of(ACTIVE, RETIRED));
        TRANSITIONS.put(RETIRED, Set.of()); // terminal
    }

    public boolean canTransitionTo(MachineStatus target) {
        return TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }

    public MachineStatus transitionTo(MachineStatus target) {
        if (!canTransitionTo(target)) {
            throw new IllegalStateException(
                    "Invalid machine status transition: " + this + " → " + target);
        }
        return target;
    }
}
