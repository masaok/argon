#!/usr/bin/env bash
# First-run bootstrap: file-backed zpool + ZFS delegation, then daemon + UI.
# Runs as root only long enough to set up the pool; argond runs as postgres.
set -euo pipefail

POOL="${ARGON_DATASET%%/*}"
POOL_IMG=/var/lib/argon/pool.img
POOL_SIZE="${ARGON_POOL_SIZE:-20G}"

mkdir -p /var/lib/argon "${ARGON_STATE_DIR}"

if ! zpool list -H -o name "${POOL}" >/dev/null 2>&1; then
  if [ ! -f "${POOL_IMG}" ]; then
    echo "[argon] creating ${POOL_SIZE} file-backed pool image at ${POOL_IMG}"
    truncate -s "${POOL_SIZE}" "${POOL_IMG}"
  fi
  # -f: the file has no existing pool label; import if a previous container
  # created it already
  zpool import "${POOL}" -d /var/lib/argon 2>/dev/null \
    || zpool create -f "${POOL}" "${POOL_IMG}"
fi

# argond runs as postgres (initdb refuses root); give it delegated ZFS rights
zfs allow postgres create,snapshot,clone,mount,destroy,promote "${POOL}"
MOUNTPOINT="$(zfs get -H -o value mountpoint "${POOL}")"
chown -R postgres:postgres "${MOUNTPOINT}" "${ARGON_STATE_DIR}"

echo "[argon] starting argond"
runuser -u postgres -- env \
  ARGON_DATASET="${ARGON_DATASET}" \
  ARGON_STATE_DIR="${ARGON_STATE_DIR}" \
  ARGON_PG_BIN="${ARGON_PG_BIN}" \
  node /app/packages/daemon/dist/index.js &
DAEMON_PID=$!

echo "[argon] starting web UI on :3000"
cd /app/packages/web
pnpm start &
WEB_PID=$!

trap 'kill ${DAEMON_PID} ${WEB_PID} 2>/dev/null || true' TERM INT
wait -n "${DAEMON_PID}" "${WEB_PID}"
