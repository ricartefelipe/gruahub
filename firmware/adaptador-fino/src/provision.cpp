#include "provision.h"
#include "version.h"
#include <ArduinoJson.h>

static String gLine;

void provisionBegin() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.print("GRUAHUB_ADAPTADOR ");
  Serial.println(ADAPTADOR_FIRMWARE_VERSION);
  Serial.println("CMD: SHOW | SAVE | SET key=value | JSON {...}");
}

static void printShow(const DeviceConfig &cfg) {
  JsonDocument doc;
  doc["wifi_ssid"] = cfg.wifiSsid;
  doc["wifi_pass"] = cfg.wifiPassword.length() > 0 ? "***" : "";
  doc["mqtt_host"] = cfg.mqttHost;
  doc["mqtt_port"] = cfg.mqttPort;
  doc["mqtt_user"] = cfg.mqttUser;
  doc["mqtt_pass"] = cfg.mqttPassword.length() > 0 ? "***" : "";
  doc["tenant_id"] = cfg.tenantId;
  doc["machine_id"] = cfg.machineId;
  doc["pulse_ms"] = cfg.pulseMs;
  doc["pulse_gap_ms"] = cfg.pulseGapMs;
  doc["credit_gpio"] = cfg.creditOutGpio;
  doc["play_gpio"] = cfg.playInGpio;
  doc["provisioned"] = configIsProvisioned(cfg);
  doc["firmware"] = ADAPTADOR_FIRMWARE_VERSION;
  serializeJson(doc, Serial);
  Serial.println();
}

static void applyJson(DeviceConfig &cfg, const String &json) {
  JsonDocument doc;
  if (deserializeJson(doc, json)) {
    Serial.println("ERR json");
    return;
  }
  JsonObjectConst obj = doc.as<JsonObjectConst>();
  for (JsonPairConst kv : obj) {
    configSetField(cfg, String(kv.key().c_str()), kv.value().as<String>());
  }
  Serial.println("OK json");
}

static void handleLine(DeviceConfig &cfg, String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }
  if (line.equalsIgnoreCase("SHOW")) {
    printShow(cfg);
    return;
  }
  if (line.equalsIgnoreCase("SAVE")) {
    if (configSave(cfg)) {
      Serial.println("OK save");
    } else {
      Serial.println("ERR save");
    }
    return;
  }
  if (line.startsWith("SET ") || line.startsWith("set ")) {
    String rest = line.substring(4);
    int eq = rest.indexOf('=');
    if (eq <= 0) {
      Serial.println("ERR set");
      return;
    }
    String key = rest.substring(0, eq);
    String value = rest.substring(eq + 1);
    key.trim();
    value.trim();
    configSetField(cfg, key, value);
    Serial.println("OK set");
    return;
  }
  if (line.startsWith("{")) {
    applyJson(cfg, line);
    return;
  }
  Serial.println("ERR cmd");
}

void provisionPoll(DeviceConfig &cfg) {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (gLine.length() > 0) {
        handleLine(cfg, gLine);
        gLine = "";
      }
      continue;
    }
    if (gLine.length() < SERIAL_LINE_MAX) {
      gLine += c;
    }
  }
}
