# f1-mcp-server

Production-oriented, sessionful MCP server (Streamable HTTP) that exposes Formula 1 data via FastF1 (Python) plus FIA and other cited reference sources to MCP clients (e.g. OpenClaw).

## Why Fast-F1 needs a Python worker

Fast-F1 is a Python library, so this project runs Fast-F1 in a long-lived Python worker process and the MCP server (Node/TypeScript) calls it over stdin/stdout using newline-delimited JSON.

## Requirements

- Node.js 20+
- Python 3.11+
- uv (recommended)

## Setup

From this directory:

```bash
npm install
```

Set up the Python worker:

```bash
cd python-worker
uv sync
```

## Environment variables

- `MCP_AUTH_TOKEN` (required): bearer token required for all `/mcp` requests
- `PORT` (optional): default `8787`
- `MCP_PATH` (optional): default `/mcp`
- `MCP_MEMORY_PATH` (optional): default `./data/memory.json` (persistent cases and KV)
- `FASTF1_CACHE_DIR` (optional): default `python-worker/.fastf1-cache` (timing cache)
- `FASTF1_WORKER_CWD` (optional): directory of the Python worker (defaults to `./python-worker`)
- `FASTF1_WORKER_CMD` (optional): defaults to `uv`
- `FASTF1_WORKER_ARGS` (optional): defaults to `run python worker.py`
- `FIA_REGS_DIR` (optional): default `./fia-regulations` (downloaded FIA PDFs for search)

## Run locally

```bash
npm run build
MCP_AUTH_TOKEN=dev-token npm start
```

Health check:

```bash
curl http://localhost:8787/health
```

## Tools (high level)

- `f1_resolve_event`: resolve flexible queries like "Monza", "Italy", "Italian Grand Prix" into a canonical `EventName`
- `f1_list_events`: list season events with `EventName`, `OfficialEventName`, `Location`, `Country`
- `f1_get_session_results`: session classification/results
- `f1_get_laps`: lap-by-lap data
- `f1_get_telemetry`: telemetry for a driver + lap
- `f1_list_drivers`, `f1_list_teams`: drivers/teams from real session results
- `f1_get_driver_profile`, `f1_get_team_profile`: driver/team profiles from real session results
- `f1_chart_session_results`: returns an `image/png` chart for session results (points or position)
- `f1_chart_lap_times`: returns an `image/png` chart for a driver's lap times
- `f1_build_evidence_pack`: bundles race data + FIA snippets + wiki guidance + optional chart
- `fia_prepare_f1_regulations`, `fia_search_f1_regulations`: download and search FIA PDFs (snippets + page citations)
- `ref_*`: external reference fetchers (with citations)
- `case_*`: save/list/get/delete evidence packs and analyses

## Resources

- `fastf1://skills` (markdown): skills overview
- `fastf1://data-dictionary` (markdown): data dictionary for common outputs
- `fastf1://wiki` (markdown): rules-focused wiki and role playbooks
- `fastf1://social/x` (markdown): official org X accounts and social tools

## Deployment notes (serverless)

This project is sessionful and uses a long-lived Python subprocess. That is not a good fit for Vercel’s serverless runtime (processes are short-lived and requests may hit different instances, breaking session affinity and worker reuse).

Recommended deployment targets for this architecture:

- Fly.io
- Railway
- Render
- Any VM/container runtime (Docker)

## Deploy (Docker on VPS)

See docs:

- `docs/DEPLOYMENT.md`
