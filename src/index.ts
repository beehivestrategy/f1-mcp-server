import { randomUUID } from 'node:crypto';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { isInitializeRequest } from '@modelcontextprotocol/server';

import { createServer } from './mcp/createServer.js';

const port = Number(process.env.PORT ?? 8787);
const mcpPath = process.env.MCP_PATH ?? '/mcp';
const host = process.env.HOST ?? '0.0.0.0';

const authToken = process.env.MCP_AUTH_TOKEN;
if (!authToken) {
  throw new Error('MCP_AUTH_TOKEN is required');
}

async function main() {
  const app = createMcpExpressApp({ host });
  const transports = new Map<string, NodeStreamableHTTPServerTransport>();

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(mcpPath, (req, res, next) => {
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    const token = header.slice('bearer '.length).trim();
    if (token !== authToken) {
      res.status(403).json({ error: 'Invalid bearer token' });
      return;
    }
    next();
  });

  app.all(mcpPath, async (req, res) => {
    const sessionIdHeader = req.header('mcp-session-id')?.trim();
    const existing = sessionIdHeader ? transports.get(sessionIdHeader) : undefined;

    if (existing) {
      await existing.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: sessionId => {
          transports.set(sessionId, transport);
        },
        onsessionclosed: sessionId => {
          transports.delete(sessionId);
        },
        enableJsonResponse: true,
      });

      const server = createServer();
      await server.connect(transport);

      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
  });

  app.listen(port);
}

await main();
