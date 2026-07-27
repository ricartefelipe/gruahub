#include "pulse_driver.h"

static String gLastPulseError;
static int8_t gCreditGpio = -1;

void pulseInit(const DeviceConfig &cfg) {
  gLastPulseError = "";
  gCreditGpio = cfg.creditOutGpio;
  if (gCreditGpio < 0) {
    gLastPulseError = "credit_gpio_unset";
    return;
  }
  pinMode(gCreditGpio, OUTPUT);
  digitalWrite(gCreditGpio, LOW);
}

bool pulseEmitCredits(const DeviceConfig &cfg, int playsGranted) {
  gLastPulseError = "";
  if (cfg.creditOutGpio < 0) {
    gLastPulseError = "credit_gpio_unset";
    return false;
  }
  if (playsGranted < 1) {
    gLastPulseError = "invalid_plays";
    return false;
  }

  uint16_t pulseMs = cfg.pulseMs == 0 ? 100 : cfg.pulseMs;
  uint16_t gapMs = cfg.pulseGapMs;

  for (int i = 0; i < playsGranted; i++) {
    digitalWrite(cfg.creditOutGpio, HIGH);
    delay(pulseMs);
    digitalWrite(cfg.creditOutGpio, LOW);
    if (i + 1 < playsGranted && gapMs > 0) {
      delay(gapMs);
    }
  }
  return true;
}

bool pulseLastError(String &reason) {
  if (gLastPulseError.length() == 0) {
    return false;
  }
  reason = gLastPulseError;
  return true;
}
