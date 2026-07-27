#include "play_in.h"
#include "mqtt_app.h"

static int gLastPlayLevel = HIGH;
static bool gPlayReady = false;

bool playInEnabled(const DeviceConfig &cfg) {
  return cfg.playInGpio >= 0;
}

void playInBegin(const DeviceConfig &cfg) {
  gPlayReady = false;
  if (!playInEnabled(cfg)) {
    return;
  }
  pinMode(cfg.playInGpio, INPUT_PULLUP);
  gLastPlayLevel = digitalRead(cfg.playInGpio);
  gPlayReady = true;
}

void playInPoll(const DeviceConfig &cfg) {
  if (!gPlayReady || !playInEnabled(cfg)) {
    return;
  }
  int level = digitalRead(cfg.playInGpio);
  if (level == gLastPlayLevel) {
    return;
  }
  if (gLastPlayLevel == HIGH && level == LOW) {
    mqttAppNotifyPlayEdge(true);
  } else if (gLastPlayLevel == LOW && level == HIGH) {
    mqttAppNotifyPlayEdge(false);
  }
  gLastPlayLevel = level;
}
