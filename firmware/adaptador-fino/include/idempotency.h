#pragma once

#include <Arduino.h>
#include "version.h"


bool idempotencySeen(const String &commandId);
void idempotencyRemember(const String &commandId);
void idempotencyLoad();
void idempotencyPersist();
