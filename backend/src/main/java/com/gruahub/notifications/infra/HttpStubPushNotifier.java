package com.gruahub.notifications.infra;

import com.gruahub.notifications.domain.PushNotifier;
import com.gruahub.shared.domain.JsonUtil;
import io.quarkus.arc.lookup.LookupIfProperty;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@ApplicationScoped
@LookupIfProperty(name = "gruahub.push.provider", stringValue = "http-stub")
public class HttpStubPushNotifier implements PushNotifier {

    private static final Logger LOG = Logger.getLogger(HttpStubPushNotifier.class);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @ConfigProperty(name = "gruahub.push.http-stub.url", defaultValue = "")
    String stubUrl;

    @Override
    public void notify(PushMessage message) {
        if (stubUrl == null || stubUrl.isBlank()) {
            LOG.warn("[PUSH-HTTP-STUB] gruahub.push.http-stub.url empty — skipping delivery");
            return;
        }

        String json = buildPayload(message);

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(stubUrl))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            LOG.infof(
                    "[PUSH-HTTP-STUB] POST %s status=%d type=%s tenant=%s",
                    stubUrl,
                    response.statusCode(),
                    message.alertType(),
                    message.tenantId());
        } catch (Exception e) {
            LOG.warnf(
                    "[PUSH-HTTP-STUB] delivery failed url=%s type=%s error=%s",
                    stubUrl,
                    message.alertType(),
                    e.getMessage());
        }
    }

    static String buildPayload(PushMessage message) {
        return "{"
                + "\"channel\":\"push-stub\","
                + "\"provider\":\"http-stub\","
                + "\"tenantId\":" + jsonStringOrNull(message.tenantId() != null ? message.tenantId().toString() : null) + ","
                + "\"machineId\":" + jsonStringOrNull(message.machineId() != null ? message.machineId().toString() : null) + ","
                + "\"alertType\":" + jsonStringOrNull(message.alertType()) + ","
                + "\"severity\":" + jsonStringOrNull(message.severity()) + ","
                + "\"title\":" + jsonStringOrNull(message.title()) + ","
                + "\"body\":" + jsonStringOrNull(message.body())
                + "}";
    }

    private static String jsonStringOrNull(String value) {
        if (value == null) {
            return "null";
        }
        return "\"" + JsonUtil.escape(value) + "\"";
    }
}
