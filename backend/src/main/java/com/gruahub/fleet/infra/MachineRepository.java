package com.gruahub.fleet.infra;

import com.gruahub.fleet.domain.Machine;
import com.gruahub.fleet.domain.MachineStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class MachineRepository implements PanacheRepositoryBase<Machine, UUID> {

    public List<Machine> findByTenant(UUID tenantId, int page, int size) {
        return find("tenantId = ?1", tenantId)
                .page(page, size)
                .list();
    }

    public long countByTenant(UUID tenantId) {
        return count("tenantId = ?1", tenantId);
    }

    public List<Machine> findByTenantAndStatus(UUID tenantId, MachineStatus status) {
        return find("tenantId = ?1 AND status = ?2", tenantId, status).list();
    }

    public Optional<Machine> findByIdAndTenant(UUID id, UUID tenantId) {
        return find("id = ?1 AND tenantId = ?2", id, tenantId).firstResultOptional();
    }

    public Optional<Machine> findByQrCodeAndTenant(String qrCode, UUID tenantId) {
        return find("qrCode = ?1 AND tenantId = ?2", qrCode, tenantId).firstResultOptional();
    }

    public Optional<Machine> findByAssetNumberAndTenant(String assetNumber, UUID tenantId) {
        return find("assetNumber = ?1 AND tenantId = ?2", assetNumber, tenantId).firstResultOptional();
    }

    public long countOnlineByTenant(UUID tenantId) {
        return count("tenantId = ?1 AND status = ?2", tenantId, MachineStatus.ACTIVE);
    }

    public long countOfflineByTenant(UUID tenantId) {
        return count("tenantId = ?1 AND status = ?2", tenantId, MachineStatus.OFFLINE);
    }

    public long countMaintenanceByTenant(UUID tenantId) {
        return count("tenantId = ?1 AND status = ?2", tenantId, MachineStatus.MAINTENANCE);
    }
}
