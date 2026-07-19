package com.gruahub.iot.infra;

import io.quarkus.runtime.ShutdownEvent;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.jboss.logging.Logger;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@ApplicationScoped
public class MqttClientService implements MqttCallbackExtended {

    private static final Logger LOG = Logger.getLogger(MqttClientService.class);

    private static final String[] SUBSCRIPTIONS = {
            "v1/+/machines/+/telemetry",
            "v1/+/machines/+/events",
            "v1/+/machines/+/status",
            "v1/+/machines/+/command-acks"
    };

    @ConfigProperty(name = "gruahub.mqtt.broker-url", defaultValue = "tcp://localhost:1883")
    String brokerUrl;

    @ConfigProperty(name = "gruahub.mqtt.username", defaultValue = "gruahub-backend")
    String username;

    @ConfigProperty(name = "gruahub.mqtt.password", defaultValue = "gruahub-backend-pass")
    String password;

    @Inject
    MqttMessageProcessor messageProcessor;

    private MqttClient client;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private final AtomicBoolean connecting = new AtomicBoolean(false);

    void onStart(@Observes StartupEvent event) {
        ensureConnected();
    }

    @Scheduled(every = "15s", delayed = "10s")
    void reconnectIfNeeded() {
        if (isConnected()) {
            return;
        }
        ensureConnected();
    }

    void onStop(@Observes ShutdownEvent event) {
        try {
            if (client != null && client.isConnected()) {
                client.disconnect();
                LOG.info("MQTT disconnected gracefully");
            }
        } catch (MqttException e) {
            LOG.errorf("Error disconnecting MQTT: %s", e.getMessage());
        } finally {
            connected.set(false);
        }
    }

    private synchronized void ensureConnected() {
        if (isConnected() || !connecting.compareAndSet(false, true)) {
            return;
        }
        try {
            if (client == null) {
                String clientId = "gruahub-backend-" + UUID.randomUUID().toString().substring(0, 8);
                client = new MqttClient(brokerUrl, clientId,
                        new org.eclipse.paho.client.mqttv3.persist.MemoryPersistence());
                client.setCallback(this);
            }

            if (!client.isConnected()) {
                MqttConnectOptions options = new MqttConnectOptions();
                options.setUserName(username);
                options.setPassword(password.toCharArray());
                options.setCleanSession(true);
                options.setAutomaticReconnect(true);
                options.setConnectionTimeout(10);
                options.setKeepAliveInterval(30);
                client.connect(options);
            }

            subscribeAll();
            connected.set(true);
            LOG.infof("MQTT connected to %s as %s", brokerUrl, client.getClientId());
        } catch (MqttException e) {
            connected.set(false);
            LOG.warnf("MQTT connection failed (will retry): %s", e.getMessage());
        } finally {
            connecting.set(false);
        }
    }

    private void subscribeAll() throws MqttException {
        for (String topic : SUBSCRIPTIONS) {
            client.subscribe(topic, 1);
        }
    }

    @Override
    public void connectComplete(boolean reconnect, String serverURI) {
        try {
            subscribeAll();
            connected.set(true);
            LOG.infof("MQTT %s complete to %s — subscriptions restored",
                    reconnect ? "reconnect" : "connect", serverURI);
        } catch (MqttException e) {
            connected.set(false);
            LOG.warnf("MQTT subscribe after connect failed: %s", e.getMessage());
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        connected.set(false);
        LOG.warnf("MQTT connection lost: %s — will retry",
                cause != null ? cause.getMessage() : "unknown");
    }

    @Override
    public void messageArrived(String topic, MqttMessage message) {
        try {
            String payload = new String(message.getPayload(), StandardCharsets.UTF_8);
            LOG.debugf("MQTT message on topic %s: %s", topic, payload);
            messageProcessor.process(topic, payload);
        } catch (Exception e) {
            LOG.errorf("Error processing MQTT message on %s: %s", topic, e.getMessage());
        }
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) {
        LOG.debugf("MQTT message delivered: %s", token.getMessageId());
    }

    public void publishCommand(String tenantId, String machineId, String payloadJson) {
        String topic = String.format("v1/%s/machines/%s/commands", tenantId, machineId);
        publish(topic, payloadJson, 1);
    }

    public void publish(String topic, String payloadJson, int qos) {
        if (client == null || !client.isConnected()) {
            LOG.warnf("MQTT not connected, cannot publish to %s", topic);
            return;
        }
        try {
            MqttMessage msg = new MqttMessage(payloadJson.getBytes(StandardCharsets.UTF_8));
            msg.setQos(qos);
            msg.setRetained(false);
            client.publish(topic, msg);
            LOG.debugf("MQTT published to %s", topic);
        } catch (MqttException e) {
            LOG.errorf("Failed to publish MQTT message to %s: %s", topic, e.getMessage());
        }
    }

    public boolean isConnected() {
        return client != null && client.isConnected() && connected.get();
    }
}
