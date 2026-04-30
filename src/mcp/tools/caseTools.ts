import { randomUUID } from 'node:crypto';

import type { CallToolResult } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { KvStore } from '../../memory/kvStore.js';

const store = new KvStore(process.env.MCP_MEMORY_PATH ?? './data/memory.json');
const NAMESPACE = 'cases';

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

export function registerCaseTools(server: McpServer) {
  server.registerTool(
    'case_save',
    {
      title: 'Case Save',
      description: 'Save an analysis/evidence pack into persistent storage for later reuse.',
      inputSchema: z.object({
        caseId: z.string().min(1).optional(),
        title: z.string().min(1),
        tags: z.array(z.string().min(1)).default([]),
        payload: z.unknown(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ caseId, title, tags, payload }): Promise<CallToolResult> => {
      try {
        const id = caseId ?? randomUUID();
        await store.set(NAMESPACE, id, { id, title, tags, payload, savedAt: new Date().toISOString() });
        return ok(`Saved case "${title}".`, { caseId: id, ok: true });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'case_get',
    {
      title: 'Case Get',
      description: 'Get a saved case by caseId.',
      inputSchema: z.object({
        caseId: z.string().min(1),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ caseId }): Promise<CallToolResult> => {
      try {
        const value = await store.get(NAMESPACE, caseId);
        if (!value) return toolError(`Case not found: ${caseId}`);
        return ok(`Loaded case "${caseId}".`, { caseId, value });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'case_list',
    {
      title: 'Case List',
      description: 'List saved cases (optionally filtered by prefix).',
      inputSchema: z.object({
        prefix: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ prefix }): Promise<CallToolResult> => {
      try {
        const keys = await store.list(NAMESPACE, prefix);
        const items: Array<{ caseId: string; title?: string; tags?: unknown; savedAt?: string }> = [];
        for (const k of keys.slice(0, 200)) {
          const v = (await store.get(NAMESPACE, k)) as { title?: string; tags?: unknown; savedAt?: string } | undefined;
          items.push({ caseId: k, title: v?.title, tags: v?.tags, savedAt: v?.savedAt });
        }
        return ok('Listed saved cases.', { count: items.length, items });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'case_delete',
    {
      title: 'Case Delete',
      description: 'Delete a saved case by caseId.',
      inputSchema: z.object({
        caseId: z.string().min(1),
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ caseId }): Promise<CallToolResult> => {
      try {
        const deleted = await store.delete(NAMESPACE, caseId);
        return ok(`Deleted case "${caseId}".`, { caseId, deleted });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

