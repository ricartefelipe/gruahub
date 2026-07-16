package com.gruahub.fleet.application;

import com.gruahub.audit.application.AuditService;
import com.gruahub.fleet.api.CreateMachineRequest;
import com.gruahub.fleet.api.MachineResponse;
import com.gruahub.fleet.api.UpdateMachineRequest;
import com.gruahub.fleet.domain.Machine;
import com.gruahub.fleet.domain.MachineStatus;
import com.gruahub.fleet.infra.MachineRepository;
import com.gruahub.shared.api.PageResponse;
import com.gruahub.shared.domain.TenantContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class MachineService {

    @Inject
    MachineRepository machineRepository;

    @Inject
    AuditService auditService;

    @Transactional
    public MachineResponse create(CreateMachineRequest req) {
        UUID tenantId = TenantContext.getTenantId();

        // Verificar unicidade do asset_number dentro do tenant
        machineRepository.findByAssetNumberAndTenant(req.assetNumber(), tenantId)
                .ifPresent(m -> {
                    throw new WebApplicationException(
                            Response.status(409).entity("Asset number already exists in this tenant").build());
                });

        var machine = Machine.create(
                UUID.randomUUID(),
                tenantId,
                req.assetNumber(),
                req.name(),
                req.playPriceCents(),
                req.currency() != null ? req.currency() : "BRL"
        );

        if (req.qrCode() != null) machine.setQrCode(req.qrCode());
        if (req.machineModelId() != null) machine.setMachineModelId(req.machineModelId());
        if (req.prizeCapacity() != null) machine.setPrizeCapacity(req.prizeCapacity());
        if (req.bonusPlays() != null) machine.setBonusPlays(req.bonusPlays());
        if (req.notes() != null) machine.setNotes(req.notes());
        if (req.operatingPointId() != null) machine.assignToPoint(req.operatingPointId());
        if (req.controllerId() != null) machine.assignController(req.controllerId());

        machineRepository.persist(machine);

        auditService.record(tenantId, "MACHINE_CREATED", "MACHINE", machine.getId().toString(),
                "{\"assetNumber\":\"" + machine.getAssetNumber() + "\"}");

        return MachineResponse.from(machine);
    }

    public PageResponse<MachineResponse> list(int page, int size) {
        UUID tenantId = TenantContext.getTenantId();
        List<Machine> machines = machineRepository.findByTenant(tenantId, page, size);
        long total = machineRepository.countByTenant(tenantId);
        return PageResponse.of(machines.stream().map(MachineResponse::from).toList(), page, size, total);
    }

    public MachineResponse getById(UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        return machineRepository.findByIdAndTenant(id, tenantId)
                .map(MachineResponse::from)
                .orElseThrow(() -> new NotFoundException("Machine not found: " + id));
    }

    @Transactional
    public MachineResponse update(UUID id, UpdateMachineRequest req) {
        UUID tenantId = TenantContext.getTenantId();
        Machine machine = machineRepository.findByIdAndTenant(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Machine not found: " + id));

        if (req.name() != null) machine.setName(req.name());
        if (req.notes() != null) machine.setNotes(req.notes());
        if (req.playPriceCents() != null) machine.setPlayPriceCents(req.playPriceCents());
        if (req.bonusPlays() != null) machine.setBonusPlays(req.bonusPlays());
        if (req.prizeCapacity() != null) machine.setPrizeCapacity(req.prizeCapacity());
        if (req.operatingPointId() != null) machine.assignToPoint(req.operatingPointId());
        if (req.controllerId() != null) machine.assignController(req.controllerId());

        auditService.record(tenantId, "MACHINE_UPDATED", "MACHINE", id.toString(), "{}");

        return MachineResponse.from(machine);
    }

    @Transactional
    public MachineResponse changeStatus(UUID id, MachineStatus targetStatus) {
        UUID tenantId = TenantContext.getTenantId();
        Machine machine = machineRepository.findByIdAndTenant(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Machine not found: " + id));

        switch (targetStatus) {
            case ACTIVE -> machine.activate();
            case OFFLINE -> machine.markOffline();
            case MAINTENANCE -> machine.startMaintenance();
            case DISABLED -> machine.disable();
            case RETIRED -> machine.retire();
            default -> throw new WebApplicationException(
                    Response.status(400).entity("Invalid target status: " + targetStatus).build());
        }

        auditService.record(tenantId, "MACHINE_STATUS_CHANGED", "MACHINE", id.toString(),
                "{\"newStatus\":\"" + targetStatus + "\"}");

        return MachineResponse.from(machine);
    }

    public MachineStatusSummary getStatusSummary() {
        UUID tenantId = TenantContext.getTenantId();
        return new MachineStatusSummary(
                machineRepository.countOnlineByTenant(tenantId),
                machineRepository.countOfflineByTenant(tenantId),
                machineRepository.countMaintenanceByTenant(tenantId)
        );
    }

    public record MachineStatusSummary(long online, long offline, long maintenance) {}
}
