#!/usr/bin/env sh
# Argon one-line installer (Docker path):
#   curl -fsSL https://raw.githubusercontent.com/masaok/argon/main/install.sh | sh
set -eu

REPO="https://raw.githubusercontent.com/masaok/argon/main"
DIR="${ARGON_HOME:-$HOME/.argon-docker}"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required for the easy-install path." >&2
  echo "Install Docker (https://docs.docker.com/get-docker/) or use the native path:" >&2
  echo "  pnpm add -g argon && argon init" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose v2 is required (docker compose version failed)." >&2
  exit 1
fi

# Linux host needs the ZFS kernel module; warn early rather than fail cryptically.
if [ "$(uname -s)" = "Linux" ] && ! lsmod 2>/dev/null | grep -q '^zfs'; then
  echo "warning: ZFS kernel module not loaded on this host." >&2
  echo "  Ubuntu: sudo apt install zfsutils-linux && sudo modprobe zfs" >&2
fi

mkdir -p "$DIR"
cd "$DIR"
echo "Fetching docker-compose.yml into $DIR ..."
curl -fsSL "$REPO/docker-compose.yml" -o docker-compose.yml

docker compose up -d

echo ""
echo "Argon is starting:"
echo "  UI:        http://localhost:3000"
echo "  Branches:  ports 5433-5443"
echo "  Stop:      (cd $DIR && docker compose down)"
