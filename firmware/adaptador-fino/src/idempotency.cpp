#include "idempotency.h"
#include <Preferences.h>

static String gSlots[IDEMPOTENCY_SLOTS];
static int gSlotIndex = 0;
static Preferences gIdemPrefs;

void idempotencyLoad() {
  for (int i = 0; i < IDEMPOTENCY_SLOTS; i++) {
    gSlots[i] = "";
  }
  gSlotIndex = 0;
  if (!gIdemPrefs.begin("idem", true)) {
    return;
  }
  for (int i = 0; i < IDEMPOTENCY_SLOTS; i++) {
    char key[8];
    snprintf(key, sizeof(key), "s%d", i);
    gSlots[i] = gIdemPrefs.getString(key, "");
  }
  gSlotIndex = gIdemPrefs.getInt("idx", 0);
  if (gSlotIndex < 0 || gSlotIndex >= IDEMPOTENCY_SLOTS) {
    gSlotIndex = 0;
  }
  gIdemPrefs.end();
}

void idempotencyPersist() {
  if (!gIdemPrefs.begin("idem", false)) {
    return;
  }
  for (int i = 0; i < IDEMPOTENCY_SLOTS; i++) {
    char key[8];
    snprintf(key, sizeof(key), "s%d", i);
    gIdemPrefs.putString(key, gSlots[i]);
  }
  gIdemPrefs.putInt("idx", gSlotIndex);
  gIdemPrefs.end();
}

bool idempotencySeen(const String &commandId) {
  if (commandId.isEmpty()) {
    return false;
  }
  for (int i = 0; i < IDEMPOTENCY_SLOTS; i++) {
    if (gSlots[i] == commandId) {
      return true;
    }
  }
  return false;
}

void idempotencyRemember(const String &commandId) {
  if (commandId.isEmpty()) {
    return;
  }
  if (idempotencySeen(commandId)) {
    return;
  }
  gSlots[gSlotIndex] = commandId;
  gSlotIndex = (gSlotIndex + 1) % IDEMPOTENCY_SLOTS;
  idempotencyPersist();
}
