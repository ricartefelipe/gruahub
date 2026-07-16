package com.gruahub.fleet.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record CreateMachineRequest(
        @NotBlank String assetNumber,
        @NotBlank String name,
        @NotNull @Min(1) Long playPriceCents,
        String currency,
        String qrCode,
        UUID machineModelId,
        UUID operatingPointId,
        UUID controllerId,
        Integer bonusPlays,
        Integer prizeCapacity,
        String notes
) {}
