package com.gruahub.fleet.api;

import com.gruahub.fleet.domain.Machine;
import com.gruahub.fleet.domain.MachineStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record MachineResponse(
        UUID id,
        UUID tenantId,
        String assetNumber,
        String name,
        String qrCode,
        MachineStatus status,
        long playPriceCents,
        String currency,
        int bonusPlays,
        int prizeCapacity,
        UUID machineModelId,
        UUID controllerId,
        UUID operatingPointId,
        LocalDate installedAt,
        Instant lastSeenAt,
        Instant createdAt,
        Instant updatedAt,
        long version,
        String notes
) {
    public static MachineResponse from(Machine m) {
        return new MachineResponse(
                m.getId(),
                m.getTenantId(),
                m.getAssetNumber(),
                m.getName(),
                m.getQrCode(),
                m.getStatus(),
                m.getPlayPriceCents(),
                m.getCurrency(),
                m.getBonusPlays(),
                m.getPrizeCapacity(),
                m.getMachineModelId(),
                m.getControllerId(),
                m.getOperatingPointId(),
                m.getInstalledAt(),
                m.getLastSeenAt(),
                m.getCreatedAt(),
                m.getUpdatedAt(),
                m.getVersion(),
                m.getNotes()
        );
    }
}
