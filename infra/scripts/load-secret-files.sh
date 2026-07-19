#!/bin/sh
set -eu

for filevar in $(printenv | awk -F= '/^[A-Za-z_][A-Za-z0-9_]*_FILE=/{print $1}'); do
  var="${filevar%_FILE}"
  path="$(printenv "$filevar" || true)"
  eval "current=\${$var:-}"
  if [ -z "${current}" ] && [ -n "${path}" ] && [ -f "${path}" ]; then
    val="$(cat "${path}")"
    export "${var}=${val}"
  fi
done
