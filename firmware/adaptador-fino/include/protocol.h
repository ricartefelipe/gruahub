#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config_store.h"

struct GrantCreditCommand {
  String commandId;
  String creditGrantId;
  int playsGranted;
  int amountCents;
  int ttlSeconds;
  unsigned long receivedAtMs;
  bool valid;
  String failureReason;
};

String protocolNewUuid();
String protocolIsoNow();
String protocolBuildEnvelope(const DeviceConfig &cfg, uint32_t &sequence, const char *type,
                             const JsonObjectConst &payload);
bool protocolParseGrantCredit(const JsonDocument &doc, GrantCreditCommand &out);
bool protocolTtlExpired(const GrantCreditCommand &cmd);
String protocolTopic(const DeviceConfig &cfg, const char *suffix);
