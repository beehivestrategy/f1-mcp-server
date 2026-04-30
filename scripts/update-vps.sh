#!/usr/bin/env bash
set -euo pipefail

MCP_DIR="${MCP_DIR:-/opt/f1-mcp-server}"

if [ ! -d "$MCP_DIR" ]; then
  echo "Directory not found: $MCP_DIR"
  exit 1
fi

cd "$MCP_DIR"
docker compose pull
docker compose up -d
docker image prune -f >/dev/null 2>&1 || true
echo "Updated."

