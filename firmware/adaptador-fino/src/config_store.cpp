#include "config_store.h"
#include "version.h"
#include <Preferences.h>

static Preferences prefs;

void configApplyDefaults(DeviceConfig &cfg) {
  cfg.wifiSsid = "";
  cfg.wifiPassword = "";
  cfg.mqttHost = "192.168.1.10";
  cfg.mqttPort = 1883;
  cfg.mqttUser = "sim-machine";
  cfg.mqttPassword = "";
  cfg.tenantId = "";
  cfg.machineId = "";
  cfg.pulseMs = 100;
  cfg.pulseGapMs = 200;
  cfg.creditOutGpio = CREDIT_OUT_GPIO;
  cfg.playInGpio = PLAY_IN_GPIO;
  cfg.loaded = false;
}

bool configLoad(DeviceConfig &cfg) {
  configApplyDefaults(cfg);
  if (!prefs.begin("adaptador", true)) {
    return false;
  }
  cfg.wifiSsid = prefs.getString("wifi_ssid", cfg.wifiSsid);
  cfg.wifiPassword = prefs.getString("wifi_pass", cfg.wifiPassword);
  cfg.mqttHost = prefs.getString("mqtt_host", cfg.mqttHost);
  cfg.mqttPort = prefs.getUShort("mqtt_port", cfg.mqttPort);
  cfg.mqttUser = prefs.getString("mqtt_user", cfg.mqttUser);
  cfg.mqttPassword = prefs.getString("mqtt_pass", cfg.mqttPassword);
  cfg.tenantId = prefs.getString("tenant_id", cfg.tenantId);
  cfg.machineId = prefs.getString("machine_id", cfg.machineId);
  cfg.pulseMs = prefs.getUShort("pulse_ms", cfg.pulseMs);
  cfg.pulseGapMs = prefs.getUShort("pulse_gap", cfg.pulseGapMs);
  cfg.creditOutGpio = prefs.getChar("credit_gpio", cfg.creditOutGpio);
  cfg.playInGpio = prefs.getChar("play_gpio", cfg.playInGpio);
  prefs.end();
  cfg.loaded = true;
  return true;
}

bool configSave(const DeviceConfig &cfg) {
  if (!prefs.begin("adaptador", false)) {
    return false;
  }
  prefs.putString("wifi_ssid", cfg.wifiSsid);
  prefs.putString("wifi_pass", cfg.wifiPassword);
  prefs.putString("mqtt_host", cfg.mqttHost);
  prefs.putUShort("mqtt_port", cfg.mqttPort);
  prefs.putString("mqtt_user", cfg.mqttUser);
  prefs.putString("mqtt_pass", cfg.mqttPassword);
  prefs.putString("tenant_id", cfg.tenantId);
  prefs.putString("machine_id", cfg.machineId);
  prefs.putUShort("pulse_ms", cfg.pulseMs);
  prefs.putUShort("pulse_gap", cfg.pulseGapMs);
  prefs.putChar("credit_gpio", cfg.creditOutGpio);
  prefs.putChar("play_gpio", cfg.playInGpio);
  prefs.end();
  return true;
}

bool configIsProvisioned(const DeviceConfig &cfg) {
  return cfg.wifiSsid.length() > 0
      && cfg.mqttHost.length() > 0
      && cfg.tenantId.length() > 0
      && cfg.machineId.length() > 0
      && cfg.mqttPassword.length() > 0;
}

void configSetField(DeviceConfig &cfg, const String &key, const String &value) {
  if (key == "wifi_ssid") {
    cfg.wifiSsid = value;
  } else if (key == "wifi_pass" || key == "wifi_password") {
    cfg.wifiPassword = value;
  } else if (key == "mqtt_host") {
    cfg.mqttHost = value;
  } else if (key == "mqtt_port") {
    cfg.mqttPort = (uint16_t)value.toInt();
  } else if (key == "mqtt_user") {
    cfg.mqttUser = value;
  } else if (key == "mqtt_pass" || key == "mqtt_password") {
    cfg.mqttPassword = value;
  } else if (key == "tenant_id") {
    cfg.tenantId = value;
  } else if (key == "machine_id") {
    cfg.machineId = value;
  } else if (key == "pulse_ms") {
    cfg.pulseMs = (uint16_t)value.toInt();
  } else if (key == "pulse_gap" || key == "pulse_gap_ms") {
    cfg.pulseGapMs = (uint16_t)value.toInt();
  } else if (key == "credit_gpio") {
    cfg.creditOutGpio = (int8_t)value.toInt();
  } else if (key == "play_gpio") {
    cfg.playInGpio = (int8_t)value.toInt();
  }
}
