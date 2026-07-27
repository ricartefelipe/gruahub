#include "mqtt_app.h"
#include "idempotency.h"
#include "protocol.h"
#include "pulse_driver.h"
#include "version.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

static DeviceConfig *gCfg = nullptr;
static WiFiClient gWifi;
static PubSubClient gMqtt(gWifi);
static uint32_t gSequence = 0;
static unsigned long gLastHeartbeatMs = 0;
static unsigned long gLastWifiAttemptMs = 0;
static unsigned long gLastMqttAttemptMs = 0;
static String gLastCreditGrantId;
static int gCreditsAvailable = 0;
static unsigned long gBootMs = 0;

static void publishEnvelope(const char *suffix, const char *type, JsonDocument &payloadDoc) {
  if (!gCfg || !gMqtt.connected()) {
    return;
  }
  JsonObjectConst payload = payloadDoc.as<JsonObjectConst>();
  String body = protocolBuildEnvelope(*gCfg, gSequence, type, payload);
  String topic = protocolTopic(*gCfg, suffix);
  gMqtt.publish(topic.c_str(), body.c_str());
}

static void publishAck(const GrantCreditCommand &cmd, bool success, const char *status,
                       const String &failureReason) {
  JsonDocument payload;
  payload["commandId"] = cmd.commandId;
  payload["commandType"] = "GRANT_CREDIT";
  if (cmd.creditGrantId.length() > 0) {
    payload["creditGrantId"] = cmd.creditGrantId;
  }
  payload["status"] = status;
  payload["success"] = success;
  if (!success && failureReason.length() > 0) {
    payload["failureReason"] = failureReason;
  }
  if (success) {
    payload["creditsAvailable"] = gCreditsAvailable;
  }
  if (success) {
    publishEnvelope("command-acks", "CREDIT_RECEIVED", payload);
  } else {
    publishEnvelope("command-acks", "COMMAND_ACK", payload);
  }
}

static void handleGrant(const GrantCreditCommand &cmdIn) {
  GrantCreditCommand cmd = cmdIn;

  if (protocolTtlExpired(cmd)) {
    publishAck(cmd, false, "REJECTED", "ttl_expired");
    return;
  }

  if (idempotencySeen(cmd.commandId)) {
    publishAck(cmd, true, "EXECUTED", "");
    return;
  }

  if (!pulseEmitCredits(*gCfg, cmd.playsGranted)) {
    String reason;
    pulseLastError(reason);
    publishAck(cmd, false, "REJECTED", reason);
    mqttAppPublishError("PULSE_FAULT", reason);
    return;
  }

  gCreditsAvailable += cmd.playsGranted;
  if (cmd.creditGrantId.length() > 0) {
    gLastCreditGrantId = cmd.creditGrantId;
  }
  idempotencyRemember(cmd.commandId);
  publishAck(cmd, true, "EXECUTED", "");
}

static void handleRemote(const JsonDocument &doc) {
  JsonObjectConst payload = doc["payload"].as<JsonObjectConst>();
  String commandId = payload["commandId"].as<String>();
  String commandType = payload["commandType"].as<String>();
  if (commandType.isEmpty()) {
    commandType = doc["type"].as<String>();
  }

  if (commandType.equalsIgnoreCase("REBOOT")) {
    JsonDocument ack;
    ack["commandId"] = commandId;
    ack["commandType"] = "REBOOT";
    ack["status"] = "EXECUTED";
    ack["success"] = true;
    publishEnvelope("command-acks", "COMMAND_ACK", ack);
    delay(200);
    ESP.restart();
    return;
  }

  if (commandType.equalsIgnoreCase("LOCK") || commandType.equalsIgnoreCase("UNLOCK")) {
    JsonDocument ack;
    ack["commandId"] = commandId;
    ack["commandType"] = commandType;
    ack["status"] = "EXECUTED";
    ack["success"] = true;
    publishEnvelope("command-acks", "COMMAND_ACK", ack);
    if (commandType.equalsIgnoreCase("UNLOCK")) {
      mqttAppPublishHeartbeat();
    }
  }
}

static void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  (void)topic;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    return;
  }

  GrantCreditCommand grant;
  if (protocolParseGrantCredit(doc, grant) && grant.valid) {
    handleGrant(grant);
    return;
  }

  String type = doc["type"].as<String>();
  String nested = doc["payload"]["commandType"].as<String>();
  if (type.equalsIgnoreCase("REBOOT") || type.equalsIgnoreCase("LOCK") || type.equalsIgnoreCase("UNLOCK")
      || nested.equalsIgnoreCase("REBOOT") || nested.equalsIgnoreCase("LOCK")
      || nested.equalsIgnoreCase("UNLOCK")) {
    handleRemote(doc);
  }
}

static void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  unsigned long now = millis();
  if (now - gLastWifiAttemptMs < WIFI_RETRY_MS) {
    return;
  }
  gLastWifiAttemptMs = now;
  WiFi.mode(WIFI_STA);
  WiFi.begin(gCfg->wifiSsid.c_str(), gCfg->wifiPassword.c_str());
}

static void ensureMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  if (gMqtt.connected()) {
    return;
  }
  unsigned long now = millis();
  if (now - gLastMqttAttemptMs < MQTT_RETRY_MS) {
    return;
  }
  gLastMqttAttemptMs = now;

  gMqtt.setServer(gCfg->mqttHost.c_str(), gCfg->mqttPort);
  gMqtt.setCallback(onMqttMessage);
  gMqtt.setBufferSize(MQTT_BUFFER_SIZE);

  String clientId = "machine-";
  clientId += gCfg->machineId;

  bool ok;
  if (gCfg->mqttUser.length() > 0) {
    ok = gMqtt.connect(clientId.c_str(), gCfg->mqttUser.c_str(), gCfg->mqttPassword.c_str());
  } else {
    ok = gMqtt.connect(clientId.c_str());
  }

  if (!ok) {
    return;
  }

  String cmdTopic = protocolTopic(*gCfg, "commands");
  gMqtt.subscribe(cmdTopic.c_str(), 1);
  mqttAppPublishHeartbeat();
}

void mqttAppBegin(DeviceConfig &cfg) {
  gCfg = &cfg;
  gBootMs = millis();
  gSequence = 0;
  gCreditsAvailable = 0;
  gLastCreditGrantId = "";
  gMqtt.setKeepAlive(30);
  ensureWifi();
}

void mqttAppLoop() {
  if (!gCfg || !configIsProvisioned(*gCfg)) {
    return;
  }
  ensureWifi();
  ensureMqtt();
  if (gMqtt.connected()) {
    gMqtt.loop();
    unsigned long now = millis();
    if (now - gLastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
      mqttAppPublishHeartbeat();
    }
  }
}

bool mqttAppConnected() {
  return gMqtt.connected();
}

void mqttAppPublishHeartbeat() {
  if (!gCfg) {
    return;
  }
  JsonDocument payload;
  payload["online"] = true;
  payload["uptimeSeconds"] = (int)((millis() - gBootMs) / 1000UL);
  payload["firmwareVersion"] = ADAPTADOR_FIRMWARE_VERSION;
  payload["creditsAvailable"] = gCreditsAvailable;
  payload["doorOpen"] = false;
  payload["motorFault"] = false;
  publishEnvelope("telemetry", "HEARTBEAT", payload);
  gLastHeartbeatMs = millis();
}

void mqttAppPublishError(const char *code, const String &message) {
  JsonDocument payload;
  payload["errorCode"] = code;
  payload["errorMessage"] = message;
  payload["doorOpen"] = false;
  payload["motorFault"] = false;
  publishEnvelope("events", "ERROR_REPORT", payload);
}

void mqttAppSetLastCreditGrantId(const String &id) {
  gLastCreditGrantId = id;
}

String mqttAppLastCreditGrantId() {
  return gLastCreditGrantId;
}

void mqttAppNotifyPlayEdge(bool rising) {
  if (!gCfg || gLastCreditGrantId.isEmpty()) {
    return;
  }
  if (rising) {
    if (gCreditsAvailable <= 0) {
      return;
    }
    gCreditsAvailable -= 1;
    JsonDocument payload;
    payload["creditGrantId"] = gLastCreditGrantId;
    payload["creditsRemaining"] = gCreditsAvailable;
    publishEnvelope("events", "PLAY_STARTED", payload);
    return;
  }

  JsonDocument payload;
  payload["creditGrantId"] = gLastCreditGrantId;
  payload["prizeDelivered"] = false;
  publishEnvelope("events", "PLAY_COMPLETED", payload);
}
