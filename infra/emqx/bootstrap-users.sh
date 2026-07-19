#!/bin/sh
set -eu

EMQX_API="${EMQX_API:-http://emqx:18083}"
ADMIN_USER="${EMQX_DASHBOARD_USERNAME:-admin}"
ADMIN_PASS="${EMQX_DASHBOARD_PASSWORD:-public}"
AUTH_ID="password_based%3Abuilt_in_database"
MQTT_USERNAME="${MQTT_USERNAME:-gruahub-backend}"
MQTT_PASSWORD="${MQTT_PASSWORD:-gruahub-backend-pass}"
MQTT_SIM_USERNAME="${MQTT_SIM_USERNAME:-sim-machine}"
MQTT_SIM_PASSWORD="${MQTT_SIM_PASSWORD:-sim-machine-pass}"

i=0
until curl -sf "${EMQX_API}/status" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "EMQX API not ready" >&2
    exit 1
  fi
  sleep 2
done

LOGIN_JSON=$(curl -sf -X POST "${EMQX_API}/api/v5/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")

TOKEN=$(printf '%s' "$LOGIN_JSON" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then
  echo "Failed to obtain EMQX API token" >&2
  exit 1
fi

upsert_user() {
  user_id="$1"
  password="$2"
  code=$(curl -s -o /tmp/emqx-user-resp -w "%{http_code}" -X POST \
    "${EMQX_API}/api/v5/authentication/${AUTH_ID}/users" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"${user_id}\",\"password\":\"${password}\"}")

  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "Created MQTT user ${user_id}"
    return 0
  fi

  if [ "$code" = "409" ] || [ "$code" = "400" ]; then
    up_code=$(curl -s -o /tmp/emqx-user-resp -w "%{http_code}" -X PUT \
      "${EMQX_API}/api/v5/authentication/${AUTH_ID}/users/${user_id}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"password\":\"${password}\"}")
    if [ "$up_code" = "200" ] || [ "$up_code" = "201" ]; then
      echo "Updated MQTT user ${user_id}"
      return 0
    fi
    echo "Failed to update MQTT user ${user_id}: HTTP ${up_code}" >&2
    cat /tmp/emqx-user-resp >&2 || true
    exit 1
  fi

  echo "Failed to create MQTT user ${user_id}: HTTP ${code}" >&2
  cat /tmp/emqx-user-resp >&2 || true
  exit 1
}

upsert_user "${MQTT_USERNAME}" "${MQTT_PASSWORD}"
upsert_user "${MQTT_SIM_USERNAME}" "${MQTT_SIM_PASSWORD}"
echo "EMQX MQTT users ready"
