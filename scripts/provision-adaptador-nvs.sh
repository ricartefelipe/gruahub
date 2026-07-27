#!/usr/bin/env bash
set -euo pipefail

PORT="${ADAPTADOR_PORT:-/dev/ttyUSB0}"
BAUD="${ADAPTADOR_BAUD:-115200}"
ENV_FILE="${1:-}"

usage() {
  cat <<'EOF'
Uso:
  scripts/provision-adaptador-nvs.sh [arquivo.env]

Variáveis (arquivo ou ambiente):
  WIFI_SSID WIFI_PASS
  MQTT_HOST MQTT_PORT MQTT_USER MQTT_PASS
  TENANT_ID MACHINE_ID
  PULSE_MS PULSE_GAP_MS
  CREDIT_GPIO PLAY_GPIO
  ADAPTADOR_PORT (default /dev/ttyUSB0)
  ADAPTADOR_BAUD (default 115200)

Exemplo:
  cp firmware/adaptador-fino/provision.env.example /tmp/adaptador.env
  # editar /tmp/adaptador.env
  ADAPTADOR_PORT=/dev/ttyACM0 scripts/provision-adaptador-nvs.sh /tmp/adaptador.env
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Arquivo não encontrado: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${WIFI_SSID:?WIFI_SSID obrigatório}"
: "${WIFI_PASS:?WIFI_PASS obrigatório}"
: "${MQTT_HOST:?MQTT_HOST obrigatório}"
: "${MQTT_USER:?MQTT_USER obrigatório}"
: "${MQTT_PASS:?MQTT_PASS obrigatório}"
: "${TENANT_ID:?TENANT_ID obrigatório}"
: "${MACHINE_ID:?MACHINE_ID obrigatório}"

MQTT_PORT="${MQTT_PORT:-1883}"
PULSE_MS="${PULSE_MS:-100}"
PULSE_GAP_MS="${PULSE_GAP_MS:-200}"
CREDIT_GPIO="${CREDIT_GPIO:-26}"
PLAY_GPIO="${PLAY_GPIO:--1}"

if [[ ! -e "$PORT" ]]; then
  echo "Porta serial inexistente: $PORT" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 é necessário para falar com a serial" >&2
  exit 1
fi

export PORT BAUD WIFI_SSID WIFI_PASS MQTT_HOST MQTT_PORT MQTT_USER MQTT_PASS
export TENANT_ID MACHINE_ID PULSE_MS PULSE_GAP_MS CREDIT_GPIO PLAY_GPIO

python3 - <<'PY'
import os, sys, time

port = os.environ["PORT"]
baud = int(os.environ["BAUD"])

try:
    import serial
except ImportError:
    print("Instale pyserial: python3 -m pip install --user pyserial", file=sys.stderr)
    sys.exit(1)

cmds = [
    f'SET wifi_ssid={os.environ["WIFI_SSID"]}',
    f'SET wifi_pass={os.environ["WIFI_PASS"]}',
    f'SET mqtt_host={os.environ["MQTT_HOST"]}',
    f'SET mqtt_port={os.environ["MQTT_PORT"]}',
    f'SET mqtt_user={os.environ["MQTT_USER"]}',
    f'SET mqtt_pass={os.environ["MQTT_PASS"]}',
    f'SET tenant_id={os.environ["TENANT_ID"]}',
    f'SET machine_id={os.environ["MACHINE_ID"]}',
    f'SET pulse_ms={os.environ["PULSE_MS"]}',
    f'SET pulse_gap_ms={os.environ["PULSE_GAP_MS"]}',
    f'SET credit_gpio={os.environ["CREDIT_GPIO"]}',
    f'SET play_gpio={os.environ["PLAY_GPIO"]}',
    "SAVE",
    "SHOW",
]

ser = serial.Serial(port, baud, timeout=1)
time.sleep(1.5)
ser.reset_input_buffer()
for line in cmds:
    ser.write((line + "\n").encode("utf-8"))
    ser.flush()
    time.sleep(0.15)
    while ser.in_waiting:
        sys.stdout.write(ser.read(ser.in_waiting).decode("utf-8", errors="replace"))
time.sleep(0.5)
while ser.in_waiting:
    sys.stdout.write(ser.read(ser.in_waiting).decode("utf-8", errors="replace"))
ser.close()
print("\nProvisionamento enviado.")
PY
