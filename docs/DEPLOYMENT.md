# Deployment (Docker on VPS)

This server is stateful (sessions + a long-lived Python worker). A single-instance container on a VPS is the simplest and most reliable production setup.

## Prerequisites

- A Linux VPS with Docker installed
- A domain or a stable IP
- A reverse proxy (recommended): Caddy or Nginx

## Environment

Required:

- `MCP_AUTH_TOKEN`

Recommended:

- `PORT=8787`
- `MCP_PATH=/mcp`
- `MCP_MEMORY_PATH=/data/memory.json`
- `FASTF1_CACHE_DIR=/data/fastf1-cache`
- `FIA_REGS_DIR=/data/fia-regulations`

## Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  f1-mcp:
    image: ghcr.io/<OWNER>/f1-mcp-server:latest
    restart: unless-stopped
    environment:
      MCP_AUTH_TOKEN: ${MCP_AUTH_TOKEN}
      PORT: 8787
      MCP_PATH: /mcp
      MCP_MEMORY_PATH: /data/memory.json
      FASTF1_CACHE_DIR: /data/fastf1-cache
      FIA_REGS_DIR: /data/fia-regulations
    ports:
      - "8787:8787"
    volumes:
      - ./data:/data
```

Create `.env`:

```bash
MCP_AUTH_TOKEN=change-me
```

Start:

```bash
docker compose up -d
```

Health check:

```bash
curl http://localhost:8787/health
```

## Reverse proxy (recommended)

Expose the container behind TLS and restrict access.

At minimum:

- terminate TLS
- set request body limits
- keep the MCP endpoint protected by `Authorization: Bearer`

## GitHub Actions deploy (optional)

If you want automatic deployments:

- build/push Docker image to GHCR
- SSH into the VPS and run `docker compose pull && docker compose up -d`

Store secrets in GitHub:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `MCP_AUTH_TOKEN` (or store on the VPS only)

## One-command install

From the VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/beehivestrategy/f1-mcp-server/main/scripts/install-vps.sh | bash
```

Update (pull latest image and restart):

```bash
curl -fsSL https://raw.githubusercontent.com/beehivestrategy/f1-mcp-server/main/scripts/update-vps.sh | bash
```

Restart only:

```bash
curl -fsSL https://raw.githubusercontent.com/beehivestrategy/f1-mcp-server/main/scripts/restart-vps.sh | bash
```

Manual (if you prefer SSHing in):

```bash
cd /opt/f1-mcp-server
docker compose up -d
docker compose restart
docker compose logs -f --tail 200
```
