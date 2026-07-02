#!/usr/bin/env bash
# First-run bootstrap, then daemon + UI. Prefers a file-backed zpool; if the
# host kernel has no ZFS module (stock WSL2 / Docker Desktop), falls back to
# a file-backed Btrfs volume automatically. Runs as root only long enough to
# set up storage; argond runs as postgres.
set -euo pipefail

POOL="${ARGON_DATASET%%/*}"
DATA_DIR=/var/lib/argon
POOL_SIZE="${ARGON_POOL_SIZE:-20G}"

mkdir -p "${DATA_DIR}" "${ARGON_STATE_DIR}"

use_zfs=false
if [ "${ARGON_STORAGE:-auto}" != "btrfs" ]; then
  if [ -e /dev/zfs ] || modprobe zfs 2>/dev/null; then
    use_zfs=true
  fi
fi

if ${use_zfs}; then
  POOL_IMG="${DATA_DIR}/pool.img"
  if ! zpool list -H -o name "${POOL}" >/dev/null 2>&1; then
    if [ ! -f "${POOL_IMG}" ]; then
      echo "[argon] creating ${POOL_SIZE} file-backed zpool image at ${POOL_IMG}"
      truncate -s "${POOL_SIZE}" "${POOL_IMG}"
    fi
    zpool import "${POOL}" -d "${DATA_DIR}" 2>/dev/null \
      || zpool create -f "${POOL}" "${POOL_IMG}"
  fi
  # argond runs as postgres (initdb refuses root); delegated ZFS rights
  zfs allow postgres create,snapshot,clone,mount,destroy,promote "${POOL}"
  MOUNTPOINT="$(zfs get -H -o value mountpoint "${POOL}")"
  chown -R postgres:postgres "${MOUNTPOINT}"
  export ARGON_STORAGE=zfs
  echo "[argon] storage: ZFS (pool ${POOL})"
else
  echo "[argon] no ZFS on host kernel — falling back to Btrfs"
  BTRFS_IMG="${DATA_DIR}/btrfs.img"
  BTRFS_ROOT="${DATA_DIR}/branches"
  if [ ! -f "${BTRFS_IMG}" ]; then
    echo "[argon] creating ${POOL_SIZE} file-backed Btrfs image at ${BTRFS_IMG}"
    truncate -s "${POOL_SIZE}" "${BTRFS_IMG}"
    mkfs.btrfs -q "${BTRFS_IMG}"
  fi
  mkdir -p "${BTRFS_ROOT}"
  # user_subvol_rm_allowed: postgres user can delete branch subvolumes
  mountpoint -q "${BTRFS_ROOT}" \
    || mount -o loop,user_subvol_rm_allowed "${BTRFS_IMG}" "${BTRFS_ROOT}"
  chown postgres:postgres "${BTRFS_ROOT}"
  export ARGON_STORAGE=btrfs ARGON_BTRFS_ROOT="${BTRFS_ROOT}"
fi

chown -R postgres:postgres "${ARGON_STATE_DIR}"

echo "[argon] starting argond"
runuser -u postgres -- env \
  ARGON_STORAGE="${ARGON_STORAGE}" \
  ARGON_BTRFS_ROOT="${ARGON_BTRFS_ROOT:-}" \
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
