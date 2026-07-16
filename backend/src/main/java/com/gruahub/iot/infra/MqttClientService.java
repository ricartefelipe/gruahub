package com.gruahub.iot.infra;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.ShutdownEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.paho.client.mqttv3.*;
import org.jboss.logging.Logger;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@ApplicationScoped
public class MqttClientService implements MqttCallback {

    private static final Logger LOG = Logger.getLogger(MqttClientService.class);

    @ConfigProperty(name = "gruahub.mqtt.broker-url", defaultValue = "tcp://localhost:1883")
    String brokerUrl;

    @ConfigProperty(name = "gruahub.mqtt.username", defaultValue = "gruahub-backend")
    String username;

    @ConfigProperty(name = "gruahub.mqtt.password", defaultValue = "gruahub-backend-pass")
    String password;

    @Inject
    MqttMessageProcessor messageProcessor;

    @Inject
    ObjectMapper objectMapper;

    private MqttClient client;
    private final AtomicBoolean connected = new AtomicBoolean(false);

    void onStart(@Observes StartupEvent event) {
        try {
            String clientId = "gruahub-backend-" + UUID.randomUUID().toString().substring(0, 8);
            client = new MqttClient(brokerUrl, clientId, new org.eclipse.paho.client.mqttv3.persist.MemoryPersistence());

            MqttConnectOptions options = new MqttConnectOptions();
            options.setUserName(username);
            options.setPassword(password.toCharArray());
            options.setCleanSession(false);
            options.setAutomaticReconnect(true);
            options.setConnectionTimeout(10);
            options.setKeepAliveInterval(30);

            client.setCallback(this);
            client.connect(options);

            // Subscribe to all tenant wildcard topics
            client.subscribe("v1/+/machines/+/telemetry", 1);
            client.subscribe("v1/+/machines/+/events", 1);
            client.subscribe("v1/+/machines/+/status", 1);
            client.subscribe("v1/+/machines/+/command-acks", 1);

            connected.set(true);
            LOG.infof("MQTT connected to %s as %s", brokerUrl, clientId);

        } catch (MqttException e) {
            LOG.warnf("MQTT connection failed (will retry): %s", e.getMessage());
        }
    }

    void onStop(@Observes ShutdownEvent event) {
        try {
            if (client != null && client.isConnected()) {
                client.disconnect();
                LOG.info("MQTT disconnected gracefully");
            }
        } catch (MqttException e) {
            LOG.errorf("Error disconnecting MQTT: %s", e.getMessage());
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        connected.set(false);
        LOG.warnf("MQTT connection lost: %s — auto-reconnect enabled", cause.getMessage());
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

    /**
     * Publica um comando para uma máquina.
     * QoS 1 para comandos e eventos financeiros.
     */
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
        return client != null && client.isConnected();
    }
}
