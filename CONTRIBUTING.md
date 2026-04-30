# Contributing

## Development setup

```bash
npm install
cd python-worker
uv sync
```

## Run

```bash
npm run build
MCP_AUTH_TOKEN=dev-token npm start
```

## Tests

```bash
npm test
```

## Guidelines

- Do not add mock race data.
- Do not commit runtime data (`data/`, FastF1 caches, downloaded PDFs).
- All external references must return source URLs for citation.
- Prefer small tool outputs; avoid returning huge telemetry blobs unless requested.

