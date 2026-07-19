#!/bin/sh
set -eu

EMQX_API="${EMQX_API:-http://emqx:18083}"
ADMIN_USER="${EMQX_DASHBOARD_USERNAME:-admin}"
ADMIN_PASS="${EMQX_DASHBOARD_PASSWORD:-}"
AUTH_ID="password_based%3Abuilt_in_database"
MQTT_USERNAME="${MQTT_USERNAME:-gruahub-backend}"
MQTT_PASSWORD="${MQTT_PASSWORD:-gruahub-backend-pass}"
MQTT_SIM_USERNAME="${MQTT_SIM_USERNAME:-sim-machine}"
MQTT_SIM_PASSWORD="${MQTT_SIM_PASSWORD:-sim-machine-pass}"

if [ -z "$ADMIN_PASS" ]; then
  echo "EMQX_DASHBOARD_PASSWORD is required" >&2
  exit 1
fi

if [ "${#ADMIN_PASS}" -lt 8 ] || [ "${#ADMIN_PASS}" -gt 64 ]; then
  echo "EMQX_DASHBOARD_PASSWORD must be 8-64 characters (got ${#ADMIN_PASS})" >&2
  exit 1
fi

i=0
until curl -sf "${EMQX_API}/status" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "EMQX API not ready" >&2
    exit 1
  fi
  sleep 2
done

TOKEN=""
login_code=""
i=0
while [ -z "$TOKEN" ]; do
  login_code=$(curl -s -o /tmp/emqx-login -w "%{http_code}" -X POST "${EMQX_API}/api/v5/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")

  if [ "$login_code" = "200" ]; then
    TOKEN=$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/emqx-login)
    if [ -n "$TOKEN" ]; then
      break
    fi
  fi

  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "Failed to obtain EMQX API token: HTTP ${login_code}" >&2
    cat /tmp/emqx-login >&2 || true
    exit 1
  fi
  sleep 2
done

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
