package com.gruahub.notifications.infra;

import com.gruahub.notifications.domain.PushNotifier.PushMessage;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ExpoPushNotifierTest {

    @Test
    void buildMessagesJson_incluiTokensETitulo() {
        var msg = new PushMessage(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "MACHINE_OFFLINE",
            "CRITICAL",
            "Máquina offline",
            "Sem heartbeat"
        );
        String json = ExpoPushNotifier.buildMessagesJson(List.of("ExponentPushToken[abc]"), msg);
        assertThat(json).contains("ExponentPushToken[abc]");
        assertThat(json).contains("Máquina offline");
        assertThat(json).contains("MACHINE_OFFLINE");
    }
}
