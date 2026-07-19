package com.gruahub.notifications.infra;

import com.gruahub.notifications.domain.PushNotifier;
import org.junit.jupiter.api.Test;

import java.util.UUID;

class NoopPushNotifierTest {

    @Test
    void notifyDoesNotThrow() {
        NoopPushNotifier notifier = new NoopPushNotifier();
        notifier.notify(new PushNotifier.PushMessage(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "MACHINE_OFFLINE",
                "WARNING",
                "Máquina Offline",
                "timeout"));
    }
}
