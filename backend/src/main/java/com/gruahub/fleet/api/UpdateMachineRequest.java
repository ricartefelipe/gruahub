package com.gruahub.fleet.api;

import java.util.UUID;

public record UpdateMachineRequest(
        String name,
        Long playPriceCents,
        Integer bonusPlays,
        Integer prizeCapacity,
        UUID operatingPointId,
        UUID controllerId,
        String notes
) {}
