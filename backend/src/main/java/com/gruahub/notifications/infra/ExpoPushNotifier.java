package com.gruahub.notifications.infra;

import com.gruahub.notifications.domain.PushNotifier;
import com.gruahub.shared.domain.JsonUtil;
import io.quarkus.arc.properties.IfBuildProperty;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
@IfBuildProperty(name = "gruahub.push.provider", stringValue = "expo")
public class ExpoPushNotifier implements PushNotifier {

    private static final Logger LOG = Logger.getLogger(ExpoPushNotifier.class);
    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .build();

    @Inject
    EntityManager em;

    @ConfigProperty(name = "gruahub.push.expo.url", defaultValue = EXPO_PUSH_URL)
    String expoUrl;

    @Override
    public void notify(PushMessage message) {
        List<String> tokens = loadTokens(message.tenantId());
        if (tokens.isEmpty()) {
            LOG.infof(
                "[PUSH-EXPO] sem tokens tenant=%s type=%s — nada a enviar",
                message.tenantId(),
                message.alertType()
            );
            return;
        }

        String body = buildMessagesJson(tokens, message);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(expoUrl))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            LOG.infof(
                "[PUSH-EXPO] POST status=%d tokens=%d type=%s tenant=%s",
                response.statusCode(),
                tokens.size(),
                message.alertType(),
                message.tenantId()
            );
        } catch (Exception e) {
            LOG.warnf(
                "[PUSH-EXPO] falha type=%s tenant=%s error=%s",
                message.alertType(),
                message.tenantId(),
                e.getMessage()
            );
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> loadTokens(UUID tenantId) {
        if (tenantId == null) {
            return List.of();
        }
        List<String> rows = em.createNativeQuery(
            "SELECT expo_push_token FROM device_token WHERE tenant_id = :tid"
        )
            .setParameter("tid", tenantId)
            .getResultList();
        return new ArrayList<>(rows);
    }

    static String buildMessagesJson(List<String> tokens, PushMessage message) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < tokens.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('{')
                .append("\"to\":").append(jsonString(tokens.get(i))).append(',')
                .append("\"sound\":\"default\",")
                .append("\"title\":").append(jsonString(message.title())).append(',')
                .append("\"body\":").append(jsonString(message.body())).append(',')
                .append("\"data\":{")
                .append("\"alertType\":").append(jsonString(message.alertType())).append(',')
                .append("\"severity\":").append(jsonString(message.severity())).append(',')
                .append("\"machineId\":").append(jsonString(
                    message.machineId() != null ? message.machineId().toString() : null
                ))
                .append('}')
                .append('}');
        }
        sb.append(']');
        return sb.toString();
    }

    private static String jsonString(String value) {
        if (value == null) {
            return "null";
        }
        return "\"" + JsonUtil.escape(value) + "\"";
    }
}
