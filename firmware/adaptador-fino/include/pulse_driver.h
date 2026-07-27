#pragma once

#include <Arduino.h>
#include "config_store.h"

void pulseInit(const DeviceConfig &cfg);
bool pulseEmitCredits(const DeviceConfig &cfg, int playsGranted);
bool pulseLastError(String &reason);
