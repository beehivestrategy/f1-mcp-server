import type { CallToolResult } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { ResourceTemplate } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { getWikiPage, searchWiki, wikiIndexMarkdown, wikiPages } from '../wiki.js';

function ok<T extends Record<string, unknown>>(summary: string, structuredContent: T): CallToolResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent,
  };
}

export function registerWiki(server: McpServer) {
  server.registerResource(
    'wiki-index',
    'fastf1://wiki',
    {
      title: 'FastF1 Wiki Index',
      description: 'Index of rules-focused wiki pages.',
      mimeType: 'text/markdown',
    },
    async uri => ({
      contents: [{ uri: uri.href, text: wikiIndexMarkdown }],
    })
  );

  const template = new ResourceTemplate('fastf1://wiki/{slug}', {
    list: async () => ({
      resources: wikiPages.map(p => ({
        uri: `fastf1://wiki/${p.slug}`,
        name: p.slug,
        description: p.title,
        mimeType: 'text/markdown',
      })),
    }),
    complete: {
      slug: async value => {
        const v = String(value ?? '').toLowerCase();
        return wikiPages.map(p => p.slug).filter(s => s.toLowerCase().startsWith(v));
      },
    },
  });

  server.registerResource(
    'wiki-page',
    template,
    {
      title: 'FastF1 Wiki Page',
      description: 'A single wiki page by slug.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = String(variables.slug ?? '').trim();
      const page = getWikiPage(slug);
      if (!page) {
        return { contents: [{ uri: uri.href, text: `Wiki page not found: ${slug}` }] };
      }
      return { contents: [{ uri: uri.href, text: page.bodyMarkdown }] };
    }
  );

  server.registerTool(
    'wiki_search',
    {
      title: 'Search Wiki',
      description: 'Search the rules-focused wiki pages by keyword and return matching page URIs.',
      inputSchema: z.object({
        query: z.string().min(2),
        maxResults: z.number().int().min(1).max(20).default(5),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, maxResults }): Promise<CallToolResult> => {
      const matches = searchWiki(query, maxResults);
      return ok(`Wiki matches for "${query}".`, { query, matches });
    }
  );
}
