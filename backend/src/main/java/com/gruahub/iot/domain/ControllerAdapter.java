package com.gruahub.iot.domain;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.UUID;

public interface ControllerAdapter {

    String adapterKey();

    String buildGrantCreditCommand(GrantCreditCommand command);

    String buildRemoteCommand(RemoteCommand command);

    NormalizedInbound normalizeInbound(String messageType, JsonNode envelope);

    record GrantCreditCommand(
            UUID tenantId,
            UUID machineId,
            String commandId,
            UUID creditGrantId,
            int playsGranted,
            long amountCents,
            int ttlSeconds
    ) {}

    record RemoteCommand(
            UUID tenantId,
            UUID machineId,
            String commandId,
            String commandType,
            int ttlSeconds
    ) {}

    record NormalizedInbound(String messageType, JsonNode envelope) {}
}
