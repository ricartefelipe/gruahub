#pragma once

#include <Arduino.h>

struct DeviceConfig {
  String wifiSsid;
  String wifiPassword;
  String mqttHost;
  uint16_t mqttPort;
  String mqttUser;
  String mqttPassword;
  String tenantId;
  String machineId;
  uint16_t pulseMs;
  uint16_t pulseGapMs;
  int8_t creditOutGpio;
  int8_t playInGpio;
  bool loaded;
};

bool configLoad(DeviceConfig &cfg);
bool configSave(const DeviceConfig &cfg);
void configApplyDefaults(DeviceConfig &cfg);
bool configIsProvisioned(const DeviceConfig &cfg);
void configSetField(DeviceConfig &cfg, const String &key, const String &value);
