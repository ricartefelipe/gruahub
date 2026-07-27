#include <Arduino.h>
#include "version.h"
#include "config_store.h"
#include "idempotency.h"
#include "pulse_driver.h"
#include "mqtt_app.h"
#include "provision.h"
#include "play_in.h"

static DeviceConfig gConfig;
static bool gMqttStarted = false;

void setup() {
  provisionBegin();
  configLoad(gConfig);
  idempotencyLoad();
  pulseInit(gConfig);
  playInBegin(gConfig);

  if (!configIsProvisioned(gConfig)) {
    Serial.println("WAIT_PROVISION");
  } else {
    Serial.println("BOOT_OK");
    mqttAppBegin(gConfig);
    gMqttStarted = true;
  }
}

void loop() {
  provisionPoll(gConfig);

  if (!configIsProvisioned(gConfig)) {
    delay(20);
    return;
  }

  if (!gMqttStarted) {
    mqttAppBegin(gConfig);
    gMqttStarted = true;
    Serial.println("BOOT_OK");
  }

  mqttAppLoop();
  playInPoll(gConfig);
  delay(5);
}
