import type { CallToolResult } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { KvStore } from '../../memory/kvStore.js';

const store = new KvStore(process.env.MCP_MEMORY_PATH ?? './data/memory.json');

function ok<T extends Record<string, unknown>>(summary: string, structuredContent: T): CallToolResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent,
  };
}

function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function registerMemoryTools(server: McpServer) {
  server.registerTool(
    'memory_kv_get',
    {
      title: 'Memory KV Get',
      description: 'Get a value from persistent key-value memory.',
      inputSchema: z.object({
        namespace: z.string().min(1).default('default'),
        key: z.string().min(1),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ namespace, key }): Promise<CallToolResult> => {
      try {
        const value = await store.get(namespace, key);
        return ok(`Fetched key "${key}" in namespace "${namespace}".`, { namespace, key, value });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'memory_kv_set',
    {
      title: 'Memory KV Set',
      description: 'Set a value in persistent key-value memory.',
      inputSchema: z.object({
        namespace: z.string().min(1).default('default'),
        key: z.string().min(1),
        value: z.unknown(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ namespace, key, value }): Promise<CallToolResult> => {
      try {
        await store.set(namespace, key, value);
        return ok(`Stored key "${key}" in namespace "${namespace}".`, { namespace, key, ok: true });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'memory_kv_delete',
    {
      title: 'Memory KV Delete',
      description: 'Delete a key from persistent key-value memory.',
      inputSchema: z.object({
        namespace: z.string().min(1).default('default'),
        key: z.string().min(1),
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ namespace, key }): Promise<CallToolResult> => {
      try {
        const deleted = await store.delete(namespace, key);
        return ok(`Delete key "${key}" in namespace "${namespace}".`, { namespace, key, deleted });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'memory_kv_list',
    {
      title: 'Memory KV List',
      description: 'List keys in a namespace (optionally filtered by prefix).',
      inputSchema: z.object({
        namespace: z.string().min(1).default('default'),
        prefix: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ namespace, prefix }): Promise<CallToolResult> => {
      try {
        const keys = await store.list(namespace, prefix);
        return ok(`Listed keys in namespace "${namespace}".`, { namespace, prefix, keys });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

