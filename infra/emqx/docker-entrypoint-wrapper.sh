#!/bin/sh
set -eu

sync_admin() {
  i=0
  until /opt/emqx/bin/emqx ctl status >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then
      echo "EMQX ctl not ready for admin sync" >&2
      touch /tmp/emqx-admin-synced
      return 0
    fi
    sleep 2
  done

  user="${EMQX_DASHBOARD__DEFAULT_USERNAME:-admin}"
  pass="${EMQX_DASHBOARD__DEFAULT_PASSWORD:-}"
  if [ -z "$pass" ]; then
    echo "EMQX dashboard password empty; skipping admin sync" >&2
  elif [ "${#pass}" -lt 8 ] || [ "${#pass}" -gt 64 ]; then
    echo "EMQX dashboard password must be 8-64 characters (got ${#pass})" >&2
  else
    /opt/emqx/bin/emqx ctl admins passwd "$user" "$pass" || \
      echo "Failed to sync EMQX dashboard password" >&2
  fi
  touch /tmp/emqx-admin-synced
}

sync_admin &
exec /usr/bin/docker-entrypoint.sh "$@"
