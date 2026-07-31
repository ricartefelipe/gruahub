#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

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
