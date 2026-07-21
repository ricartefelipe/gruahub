package com.gruahub.fleet.application;

import com.gruahub.iot.application.ControllerAdapterRegistry;
import com.gruahub.iot.domain.ControllerAdapter;
import com.gruahub.shared.domain.TenantContext;
import com.gruahub.shared.infra.OutboxPublisher;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class MachineCommandService {

    private static final Set<String> SUPPORTED = Set.of("REBOOT", "LOCK", "UNLOCK");

    @ConfigProperty(name = "gruahub.mqtt.command-ttl-seconds", defaultValue = "300")
    int commandTtlSeconds;

    @Inject
    EntityManager em;

    @Inject
    OutboxPublisher outboxPublisher;

    @Inject
    ControllerAdapterRegistry controllerAdapterRegistry;

    public record CommandResult(String commandId, String commandType, String status) {}

    @Transactional
    public CommandResult enqueue(UUID machineId, String commandType) {
        UUID tenantId = TenantContext.getTenantId();
        String normalized = commandType == null ? "" : commandType.trim().toUpperCase(Locale.ROOT);
        if (!SUPPORTED.contains(normalized)) {
            throw new IllegalArgumentException("Unsupported command type: " + commandType);
        }

        Long exists = ((Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM machine WHERE id = :mid AND tenant_id = :tid"
        )
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .getSingleResult()).longValue();
        if (exists == 0) {
            throw new NotFoundException("Machine not found: " + machineId);
        }

        String commandId = UUID.randomUUID().toString();
        ControllerAdapter adapter = controllerAdapterRegistry.forMachine(tenantId, machineId);
        String payload = adapter.buildRemoteCommand(new ControllerAdapter.RemoteCommand(
                tenantId,
                machineId,
                commandId,
                normalized,
                commandTtlSeconds
        ));

        em.createNativeQuery(
                "INSERT INTO device_command " +
                "(id, command_id, tenant_id, machine_id, command_type, payload, " +
                " status, expires_at, created_at) " +
                "VALUES (gen_random_uuid(), :cmdId, :tid, :mid, :ctype, CAST(:payload AS jsonb), " +
                "'PENDING', :expiry, :now)")
                .setParameter("cmdId", commandId)
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("ctype", normalized)
                .setParameter("payload", payload)
                .setParameter("expiry", Instant.now().plusSeconds(commandTtlSeconds))
                .setParameter("now", Instant.now())
                .executeUpdate();

        outboxPublisher.enqueue(tenantId, "device_command", UUID.fromString(commandId), normalized, payload);
        return new CommandResult(commandId, normalized, "PENDING");
    }
}
