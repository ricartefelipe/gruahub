#pragma once

#include <Arduino.h>
#include "config_store.h"

void mqttAppBegin(DeviceConfig &cfg);
void mqttAppLoop();
bool mqttAppConnected();
void mqttAppPublishHeartbeat();
void mqttAppPublishError(const char *code, const String &message);
void mqttAppSetLastCreditGrantId(const String &id);
String mqttAppLastCreditGrantId();
void mqttAppNotifyPlayEdge(bool rising);
