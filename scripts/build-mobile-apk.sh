#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

echo "Aviso: para testar no celular sem Play Store, prefira o web HTTPS:"
echo "  https://gruahub.54.94.163.136.sslip.io/mobile.html"
echo "Este script gera APK debug e não é o canal do piloto."
echo

if [[ -z "$SDK_ROOT" || ! -x "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]]; then
  echo "Android SDK não encontrado. Defina ANDROID_HOME para um SDK com cmdline-tools/latest."
  exit 1
fi

if [[ ! -f "$MOBILE/.env" ]]; then
  echo "Crie mobile/.env com as URLs públicas antes de gerar o APK."
  exit 1
fi

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

cd "$MOBILE"
set -a
. ./.env
set +a

if [[ "${EXPO_PUBLIC_API_URL:-}" == http://* || "${EXPO_PUBLIC_KEYCLOAK_URL:-}" == http://* ]]; then
  echo "Erro: APK para aparelho físico exige EXPO_PUBLIC_API_URL e EXPO_PUBLIC_KEYCLOAK_URL em HTTPS."
  echo "HTTP cleartext é bloqueado no Android moderno. Use o web HTTPS do portfólio enquanto API/Keycloak não tiverem TLS."
  exit 1
fi

PACKAGE_JSON_BACKUP="$(mktemp)"
cp package.json "$PACKAGE_JSON_BACKUP"
trap 'cp "$PACKAGE_JSON_BACKUP" package.json; rm -f "$PACKAGE_JSON_BACKUP"' EXIT

CI=1 npx expo prebuild --platform android --no-install
(
  cd android
  ./gradlew assembleDebug
)

mkdir -p dist
install -m 0644 android/app/build/outputs/apk/debug/app-debug.apk dist/gruahub-android.apk
echo "APK gerado em $MOBILE/dist/gruahub-android.apk"
echo "Hospede o arquivo em HTTPS antes de instalar no Android."
