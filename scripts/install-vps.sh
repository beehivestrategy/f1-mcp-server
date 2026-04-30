#!/usr/bin/env bash
set -euo pipefail

MCP_DIR="${MCP_DIR:-/opt/f1-mcp-server}"
MCP_PORT="${MCP_PORT:-8787}"
MCP_PATH="${MCP_PATH:-/mcp}"
MCP_IMAGE="${MCP_IMAGE:-ghcr.io/beehivestrategy/f1-mcp-server:main}"
MCP_MEMORY_PATH="${MCP_MEMORY_PATH:-/data/memory.json}"
FASTF1_CACHE_DIR="${FASTF1_CACHE_DIR:-/data/fastf1-cache}"
FIA_REGS_DIR="${FIA_REGS_DIR:-/data/fia-regulations}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

install_docker_apt() {
  as_root apt-get update -y
  as_root apt-get install -y ca-certificates curl gnupg
  as_root install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | as_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    as_root chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} \
      ${VERSION_CODENAME} stable" | as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
  fi
  as_root apt-get update -y
  as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  as_root systemctl enable --now docker
}

if ! need_cmd docker; then
  if need_cmd apt-get; then
    install_docker_apt
  else
    echo "Docker is not installed and apt-get is not available. Install Docker manually and re-run."
    exit 1
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found (docker compose). Install docker-compose-plugin and re-run."
  exit 1
fi

as_root mkdir -p "$MCP_DIR"
as_root mkdir -p "$MCP_DIR/data"
as_root chown -R "$(id -u)":"$(id -g)" "$MCP_DIR"

umask 077
if [ -z "${MCP_AUTH_TOKEN:-}" ]; then
  if need_cmd openssl; then
    MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
  else
    echo "MCP_AUTH_TOKEN is not set and openssl is not available. Set MCP_AUTH_TOKEN and re-run."
    exit 1
  fi
fi

cat >"$MCP_DIR/.env" <<EOF
MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN}
EOF

cat >"$MCP_DIR/docker-compose.yml" <<EOF
services:
  f1-mcp:
    image: ${MCP_IMAGE}
    restart: unless-stopped
    environment:
      MCP_AUTH_TOKEN: \${MCP_AUTH_TOKEN}
      PORT: ${MCP_PORT}
      MCP_PATH: ${MCP_PATH}
      MCP_MEMORY_PATH: ${MCP_MEMORY_PATH}
      FASTF1_CACHE_DIR: ${FASTF1_CACHE_DIR}
      FIA_REGS_DIR: ${FIA_REGS_DIR}
    ports:
      - "${MCP_PORT}:${MCP_PORT}"
    volumes:
      - ./data:/data
EOF

cd "$MCP_DIR"
docker compose pull
docker compose up -d

echo "Installed."
echo "MCP endpoint: http://<server-ip>:${MCP_PORT}${MCP_PATH}"
echo "Auth header: Authorization: Bearer <MCP_AUTH_TOKEN>"
echo "Token saved to: ${MCP_DIR}/.env"

