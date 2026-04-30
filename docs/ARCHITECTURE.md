# Architecture

## Overview

This project runs a sessionful MCP server over Streamable HTTP (Node.js) and delegates data work to a long-lived Python worker (FastF1).

Main components:

- Node server: HTTP + MCP protocol, tool/resource registration
- Python worker: FastF1 access, telemetry and chart generation, FIA PDF search
- Persistent storage: JSON KV store for cases + cache directories for FastF1 and FIA PDFs

## Data sources

- FastF1 (via the Python worker): timing/results/laps/telemetry when available
- FIA PDFs (downloaded locally): regulations and decision documents
- Web references (opt-in tools): Wikipedia summaries and similar sources, always returned with URLs for citation
- Wikidata: official social handles (X/Twitter) resolved with citations

## Design principles

- No mock F1 results/laps/telemetry: tools return errors when data is unavailable.
- Always cite external sources: URLs are returned for Wikipedia/Wikidata/FIA document lookups.
- Minimize copyrighted text: return short snippets + page numbers + links.

## Session model

The MCP server uses Streamable HTTP sessions:

- the client must keep the `mcp-session-id`
- the server keeps a single Python worker process for efficiency

## Files and directories

- `src/mcp/`: MCP server definitions (tools/resources)
- `src/fastf1/workerClient.ts`: Node ↔ Python worker bridge
- `python-worker/worker.py`: FastF1 + PDF search implementation
- `data/`: persistent data (KV store, caches, downloaded PDFs) (runtime only)

