package com.gruahub.fleet.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "machine")
public class Machine {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "machine_model_id")
    private UUID machineModelId;

    @Column(name = "controller_id")
    private UUID controllerId;

    @Column(name = "operating_point_id")
    private UUID operatingPointId;

    @Column(name = "asset_number", nullable = false)
    private String assetNumber;

    @Column(name = "qr_code")
    private String qrCode;

    @Column(name = "name", nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private MachineStatus status = MachineStatus.DRAFT;

    @Column(name = "play_price_cents", nullable = false)
    private long playPriceCents = 200L;

    @Column(name = "currency", nullable = false)
    private String currency = "BRL";

    @Column(name = "bonus_plays")
    private int bonusPlays = 0;

    @Column(name = "prize_capacity")
    private int prizeCapacity = 0;

    @Column(name = "installed_at")
    private LocalDate installedAt;

    @Column(name = "retired_at")
    private LocalDate retiredAt;

    @Column(name = "notes")
    private String notes;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    public Machine() {}

    public static Machine create(UUID id, UUID tenantId, String assetNumber, String name,
                                  long playPriceCents, String currency) {
        var m = new Machine();
        m.id = id;
        m.tenantId = tenantId;
        m.assetNumber = assetNumber;
        m.name = name;
        m.playPriceCents = playPriceCents;
        m.currency = currency;
        m.status = MachineStatus.DRAFT;
        return m;
    }

    public void activate() {
        this.status = this.status.transitionTo(MachineStatus.ACTIVE);
        this.updatedAt = Instant.now();
    }

    public void markOffline() {
        if (this.status == MachineStatus.ACTIVE) {
            this.status = MachineStatus.OFFLINE;
            this.updatedAt = Instant.now();
        }
    }

    public void markOnline() {
        if (this.status == MachineStatus.OFFLINE) {
            this.status = MachineStatus.ACTIVE;
        }
        this.lastSeenAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void startMaintenance() {
        this.status = this.status.transitionTo(MachineStatus.MAINTENANCE);
        this.updatedAt = Instant.now();
    }

    public void disable() {
        this.status = this.status.transitionTo(MachineStatus.DISABLED);
        this.updatedAt = Instant.now();
    }

    public void retire() {
        this.status = this.status.transitionTo(MachineStatus.RETIRED);
        this.retiredAt = LocalDate.now();
        this.updatedAt = Instant.now();
    }

    public void assignToPoint(UUID operatingPointId) {
        this.operatingPointId = operatingPointId;
        this.installedAt = LocalDate.now();
        this.updatedAt = Instant.now();
    }

    public void assignController(UUID controllerId) {
        this.controllerId = controllerId;
        this.updatedAt = Instant.now();
    }

    // Getters
    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public UUID getMachineModelId() { return machineModelId; }
    public UUID getControllerId() { return controllerId; }
    public UUID getOperatingPointId() { return operatingPointId; }
    public String getAssetNumber() { return assetNumber; }
    public String getQrCode() { return qrCode; }
    public String getName() { return name; }
    public MachineStatus getStatus() { return status; }
    public long getPlayPriceCents() { return playPriceCents; }
    public String getCurrency() { return currency; }
    public int getBonusPlays() { return bonusPlays; }
    public int getPrizeCapacity() { return prizeCapacity; }
    public LocalDate getInstalledAt() { return installedAt; }
    public LocalDate getRetiredAt() { return retiredAt; }
    public String getNotes() { return notes; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }

    // Setters (apenas para campos editáveis)
    public void setName(String name) { this.name = name; this.updatedAt = Instant.now(); }
    public void setNotes(String notes) { this.notes = notes; this.updatedAt = Instant.now(); }
    public void setPlayPriceCents(long cents) { this.playPriceCents = cents; this.updatedAt = Instant.now(); }
    public void setBonusPlays(int bonus) { this.bonusPlays = bonus; this.updatedAt = Instant.now(); }
    public void setPrizeCapacity(int cap) { this.prizeCapacity = cap; this.updatedAt = Instant.now(); }
    public void setQrCode(String qrCode) { this.qrCode = qrCode; this.updatedAt = Instant.now(); }
    public void setMachineModelId(UUID id) { this.machineModelId = id; }
    public void setLastSeenAt(Instant t) { this.lastSeenAt = t; }
}
