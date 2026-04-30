import type { CallToolResult } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { FastF1WorkerClient } from '../../fastf1/workerClient.js';

type Source = { title: string; url: string };

let worker: FastF1WorkerClient | undefined;

function getWorker() {
  if (!worker || worker.isClosed()) {
    worker = new FastF1WorkerClient();
    process.on('exit', () => worker?.close());
    process.on('SIGINT', () => worker?.close());
    process.on('SIGTERM', () => worker?.close());
  }
  return worker;
}

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

function limitText(s: string, maxChars: number) {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}

const wikiCache = new Map<string, { at: number; data: unknown }>();

async function cachedFetchJson(url: string) {
  const cached = wikiCache.get(url);
  const now = Date.now();
  if (cached && now - cached.at < 1000 * 60 * 30) return cached.data;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'fastf1-mcp-demo/0.1.0 (reference tools)',
      accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  const data = (await res.json()) as unknown;
  wikiCache.set(url, { at: now, data });
  return data;
}

const htmlCache = new Map<string, { at: number; text: string }>();

async function cachedFetchText(url: string) {
  const cached = htmlCache.get(url);
  const now = Date.now();
  if (cached && now - cached.at < 1000 * 60 * 10) return cached.text;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'fastf1-mcp-demo/0.1.0 (reference tools)',
      accept: 'text/html,*/*',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  const text = await res.text();
  htmlCache.set(url, { at: now, text });
  return text;
}

function parseFiaChampionshipDocuments(html: string) {
  const docs: Array<{ title: string; url: string; published?: string }> = [];
  const re =
    /<a[^>]+href="(?<href>[^"]*(?:system\/files\/decision-document\/|decision-document\/)[^"]+\.pdf)"[^>]*>(?<inner>[\s\S]*?)<\/a>/gi;

  for (const m of html.matchAll(re)) {
    const href = m.groups?.href;
    const inner = m.groups?.inner ?? '';
    const title = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href || !title) continue;
    const url = href.startsWith('http')
      ? href
      : href.startsWith('/')
        ? `https://www.fia.com${href}`
        : `https://www.fia.com/system/files/${href}`;
    const start = m.index ?? 0;
    const chunk = html.slice(start, start + 800);
    const pub =
      chunk.match(/Published on\s*([0-9]{2}\.[0-9]{2}\.[0-9]{2})\s*([0-9]{2}:[0-9]{2})/i) ??
      chunk.match(/Published on\s*([0-9]{2}\.[0-9]{2}\.[0-9]{2})/i);
    const published = pub ? pub.slice(1).join(' ').trim() : undefined;
    docs.push({ title, url, published });
  }

  const uniq = new Map<string, { title: string; url: string; published?: string }>();
  for (const d of docs) {
    if (!uniq.has(d.url)) uniq.set(d.url, d);
  }
  return [...uniq.values()];
}

async function wikipediaFindBestTitle(query: string) {
  const q = encodeURIComponent(query);
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${q}&limit=1`;
  const data = (await cachedFetchJson(url)) as { pages?: Array<{ title?: string }> };
  const title = data.pages?.[0]?.title;
  return title ?? null;
}

async function wikipediaSummaryByTitle(title: string) {
  const t = encodeURIComponent(title);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${t}`;
  const data = (await cachedFetchJson(url)) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string };
  };
  const pageUrl = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${t}`;
  return {
    title: data.title ?? title,
    extract: data.extract ?? '',
    url: pageUrl,
    thumbnailUrl: data.thumbnail?.source,
  };
}

export function registerReferenceTools(server: McpServer) {
  server.registerTool(
    'ref_wikipedia_summary',
    {
      title: 'Wikipedia Summary (Cited)',
      description: 'Fetch a short Wikipedia summary for a query, returning the URL for citation.',
      inputSchema: z.object({
        query: z.string().min(2),
        maxChars: z.number().int().min(200).max(4000).default(1200),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, maxChars }): Promise<CallToolResult> => {
      try {
        const title = await wikipediaFindBestTitle(query);
        if (!title) return toolError(`No Wikipedia match for "${query}".`);
        const sum = await wikipediaSummaryByTitle(title);
        const sources: Source[] = [{ title: `Wikipedia: ${sum.title}`, url: sum.url }];
        return ok(`Wikipedia summary for "${query}".`, {
          query,
          title: sum.title,
          summary: limitText(sum.extract, maxChars),
          thumbnailUrl: sum.thumbnailUrl,
          sources,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_circuit_reference',
    {
      title: 'Circuit Reference (Cited)',
      description:
        'Fetch a cited reference summary for the circuit/venue of an event using Wikipedia, plus the FastF1 schedule details (location/country).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        includeTesting: z.boolean().default(false),
        maxChars: z.number().int().min(200).max(4000).default(1400),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ year, eventQuery, includeTesting, maxChars }): Promise<CallToolResult> => {
      try {
        const schedule = await getWorker().request<Record<string, unknown>>('get_event_schedule_details', {
          year,
          query: eventQuery,
          includeTesting,
        });

        const ev = (schedule as { event?: Record<string, unknown> }).event ?? {};
        const eventName = String(ev.eventName ?? eventQuery);
        const location = String(ev.location ?? '');
        const country = String(ev.country ?? '');

        const candidates = [
          `${eventName} circuit`,
          `${eventName} Circuit`,
          `${location} circuit`,
          `${location} Grand Prix circuit`,
          `${country} Grand Prix circuit`,
        ].filter(Boolean);

        let foundTitle: string | null = null;
        for (const c of candidates) {
          foundTitle = await wikipediaFindBestTitle(c);
          if (foundTitle) break;
        }
        if (!foundTitle) {
          return ok(`No Wikipedia circuit match found for "${eventQuery}".`, {
            year,
            eventQuery,
            schedule,
            sources: [],
          });
        }

        const sum = await wikipediaSummaryByTitle(foundTitle);
        const sources: Source[] = [{ title: `Wikipedia: ${sum.title}`, url: sum.url }];

        return ok(`Circuit reference for ${year} "${eventQuery}".`, {
          year,
          eventQuery,
          schedule,
          circuit: {
            title: sum.title,
            summary: limitText(sum.extract, maxChars),
            thumbnailUrl: sum.thumbnailUrl,
          },
          sources,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'ref_fia_championship_documents',
    {
      title: 'FIA Championship Documents (Latest)',
      description:
        'Fetches and parses the FIA championships documents page to return the most recently listed decision documents, with URLs for citation.',
      inputSchema: z.object({
        season: z.number().int().min(1950).default(new Date().getUTCFullYear()),
        championship: z.string().min(1).default('FIA Formula One World Championship'),
        eventQuery: z.string().optional(),
        maxDocs: z.number().int().min(1).max(200).default(30),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ season, championship, eventQuery, maxDocs }): Promise<CallToolResult> => {
      try {
        const url = 'https://www.fia.com/documents/championships/';
        const html = await cachedFetchText(url);
        let docs = parseFiaChampionshipDocuments(html);

        const q = (eventQuery ?? '').trim().toLowerCase();
        if (q) {
          docs = docs.filter(d => d.title.toLowerCase().includes(q) || d.url.toLowerCase().includes(q));
        }

        const y = String(season);
        docs = docs.filter(d => d.title.includes(y) || d.url.includes(y));

        const sources: Source[] = [
          { title: 'FIA documents: Championships', url },
          ...docs.slice(0, maxDocs).map(d => ({ title: d.title, url: d.url })),
        ];

        return ok(`FIA documents for ${championship} (${season}).`, {
          season,
          championship,
          eventQuery,
          docs: docs.slice(0, maxDocs),
          sources,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
