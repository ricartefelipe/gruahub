#include "protocol.h"
#include "version.h"
#include <esp_random.h>
#include <time.h>


String protocolNewUuid() {
  uint8_t b[16];
  for (int i = 0; i < 16; i++) {
    b[i] = (uint8_t)esp_random();
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  char buf[37];
  snprintf(buf, sizeof(buf),
           "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
           b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
  return String(buf);
}

String protocolIsoNow() {
  time_t now = time(nullptr);
  if (now < 1700000000) {
    char buf[32];
    snprintf(buf, sizeof(buf), "1970-01-01T00:00:00.000Z");
    return String(buf);
  }
  struct tm tmUtc;
  gmtime_r(&now, &tmUtc);
  char buf[40];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S.000Z", &tmUtc);
  return String(buf);
}

String protocolTopic(const DeviceConfig &cfg, const char *suffix) {
  String t = "v1/";
  t += cfg.tenantId;
  t += "/machines/";
  t += cfg.machineId;
  t += "/";
  t += suffix;
  return t;
}

String protocolBuildEnvelope(const DeviceConfig &cfg, uint32_t &sequence, const char *type,
                             const JsonObjectConst &payload) {
  sequence += 1;
  JsonDocument doc;
  doc["messageId"] = protocolNewUuid();
  doc["schemaVersion"] = 1;
  doc["tenantId"] = cfg.tenantId;
  doc["machineId"] = cfg.machineId;
  doc["sequence"] = sequence;
  doc["type"] = type;
  doc["occurredAt"] = protocolIsoNow();
  doc["payload"] = payload;
  String out;
  serializeJson(doc, out);
  return out;
}

static String readText(JsonVariantConst v) {
  if (v.isNull()) {
    return String();
  }
  return v.as<String>();
}

bool protocolParseGrantCredit(const JsonDocument &doc, GrantCreditCommand &out) {
  out.valid = false;
  out.failureReason = "";
  out.playsGranted = 1;
  out.amountCents = 0;
  out.ttlSeconds = 120;
  out.receivedAtMs = millis();

  String topType = readText(doc["type"]);
  JsonObjectConst payload = doc["payload"].as<JsonObjectConst>();

  String nestedType;
  if (!payload.isNull()) {
    nestedType = readText(payload["type"]);
  }

  bool isGrant = topType.equalsIgnoreCase("GRANT_CREDIT")
      || nestedType.equalsIgnoreCase("GRANT_CREDIT")
      || (!payload.isNull() && payload["commandType"].as<String>().equalsIgnoreCase("GRANT_CREDIT"));

  if (!isGrant && doc["commandType"].as<String>().equalsIgnoreCase("GRANT_CREDIT")) {
    isGrant = true;
  }

  if (!isGrant) {
    out.failureReason = "not_grant_credit";
    return false;
  }

  if (!payload.isNull()) {
    out.commandId = readText(payload["commandId"]);
    if (out.commandId.isEmpty()) {
      out.commandId = readText(doc["messageId"]);
    }
    out.creditGrantId = readText(payload["creditGrantId"]);
    if (payload["playsGranted"].is<int>()) {
      out.playsGranted = payload["playsGranted"].as<int>();
    }
    if (payload["amountCents"].is<int>()) {
      out.amountCents = payload["amountCents"].as<int>();
    }
    if (payload["ttlSeconds"].is<int>()) {
      out.ttlSeconds = payload["ttlSeconds"].as<int>();
    }
  } else {
    out.commandId = readText(doc["commandId"]);
    out.creditGrantId = readText(doc["creditGrantId"]);
    if (doc["playsGranted"].is<int>()) {
      out.playsGranted = doc["playsGranted"].as<int>();
    }
    if (doc["ttlSeconds"].is<int>()) {
      out.ttlSeconds = doc["ttlSeconds"].as<int>();
    }
  }

  if (out.commandId.isEmpty()) {
    out.failureReason = "missing_command_id";
    return false;
  }
  if (out.playsGranted < 1) {
    out.failureReason = "invalid_plays";
    return false;
  }
  if (out.ttlSeconds < 1) {
    out.ttlSeconds = 120;
  }

  out.valid = true;
  return true;
}

bool protocolTtlExpired(const GrantCreditCommand &cmd) {
  if (cmd.ttlSeconds <= 0) {
    return false;
  }
  unsigned long elapsed = millis() - cmd.receivedAtMs;
  return elapsed > (unsigned long)cmd.ttlSeconds * 1000UL;
}
