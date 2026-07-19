package com.gruahub.notifications.domain;

import java.util.UUID;

public interface PushNotifier {

    void notify(PushMessage message);

    record PushMessage(
            UUID tenantId,
            UUID machineId,
            String alertType,
            String severity,
            String title,
            String body
    ) {}
}
