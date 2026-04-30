import type { CallToolResult, ResourceTemplate } from '@modelcontextprotocol/server';
import { ResourceTemplate as ResourceTemplateClass } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { FastF1WorkerClient } from '../../fastf1/workerClient.js';
import { officialOrgAccounts, type SocialAccount } from '../social.js';

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

function normalize(s: unknown) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function chunks<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const wikidataCache = new Map<string, { at: number; value: unknown }>();

async function cachedFetchJson(url: string) {
  const cached = wikidataCache.get(url);
  const now = Date.now();
  if (cached && now - cached.at < 1000 * 60 * 60 * 24) return cached.value;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'fastf1-mcp-demo/0.1.0 (social tools)',
      accept: 'application/sparql-results+json, application/json',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  const data = (await res.json()) as unknown;
  wikidataCache.set(url, { at: now, value: data });
  return data;
}

async function wikidataSearchTwitterHandles(query: string, limit: number) {
  const escaped = query.replace(/"/g, '\\"');
  const sparql = `
SELECT ?item ?itemLabel ?handle WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch" .
    bd:serviceParam wikibase:endpoint "www.wikidata.org" .
    bd:serviceParam mwapi:search "${escaped}" .
    bd:serviceParam mwapi:language "en" .
    bd:serviceParam mwapi:limit ${Math.max(1, Math.min(10, limit))} .
    ?item wikibase:apiOutputItem mwapi:item .
  }
  ?item wdt:P2002 ?handle .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const data = (await cachedFetchJson(url)) as {
    results?: { bindings?: Array<{ item?: { value?: string }; itemLabel?: { value?: string }; handle?: { value?: string } }> };
  };
  const bindings = data.results?.bindings ?? [];
  return bindings
    .map(b => {
      const handle = b.handle?.value;
      const item = b.item?.value;
      const label = b.itemLabel?.value;
      if (!handle || !item) return null;
      return {
        label: label ?? query,
        handle,
        itemUrl: item,
        xUrl: `https://x.com/${handle}`,
      };
    })
    .filter(Boolean) as Array<{ label: string; handle: string; itemUrl: string; xUrl: string }>;
}

function renderOrgAccountsMarkdown(accounts: SocialAccount[]) {
  const lines = accounts.map(a => `- ${a.label}: ${a.url}`);
  return `# Official Accounts (X)\n\n${lines.join('\n')}\n`;
}

export function registerSocialTools(server: McpServer) {
  server.registerResource(
    'social-x',
    'fastf1://social/x',
    {
      title: 'Official Social Accounts (X)',
      description: 'Curated official org accounts and guidance on resolving teams/drivers via Wikidata.',
      mimeType: 'text/markdown',
    },
    async uri => ({
      contents: [{ uri: uri.href, text: renderOrgAccountsMarkdown(officialOrgAccounts) }],
    })
  );

  const template: ResourceTemplate = new ResourceTemplateClass('fastf1://social/x/{handle}', {
    list: undefined,
    complete: {
      handle: async value => {
        const v = normalize(value);
        return officialOrgAccounts.map(a => a.handle).filter(h => h.toLowerCase().startsWith(v));
      },
    },
  });

  server.registerResource(
    'social-x-handle',
    template,
    {
      title: 'X Account',
      description: 'A single X account URL by handle.',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const handle = String(variables.handle ?? '').trim();
      return { contents: [{ uri: uri.href, text: `https://x.com/${handle}` }] };
    }
  );

  server.registerTool(
    'social_list_official_org_accounts',
    {
      title: 'List Official Org Accounts (X)',
      description: 'List curated official org accounts (F1, FIA) on X.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (): Promise<CallToolResult> => ok('Official org accounts.', { platform: 'x', accounts: officialOrgAccounts })
  );

  server.registerTool(
    'social_resolve_x_account',
    {
      title: 'Resolve X Account (Wikidata)',
      description: 'Resolve an official X/Twitter handle using Wikidata (returns citations).',
      inputSchema: z.object({
        query: z.string().min(2),
        maxCandidates: z.number().int().min(1).max(10).default(5),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, maxCandidates }): Promise<CallToolResult> => {
      try {
        const candidates = await wikidataSearchTwitterHandles(query, maxCandidates);
        const sources: Source[] = candidates.map(c => ({ title: `Wikidata: ${c.label}`, url: c.itemUrl }));
        return ok(`Resolved X accounts for "${query}".`, { query, candidates, sources });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_list_x_accounts',
    {
      title: 'List F1 X Accounts (Teams/Drivers)',
      description:
        'Lists X accounts for drivers and teams in a session by resolving their names via Wikidata. Returns citations for each match.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1).default('R'),
        includeDrivers: z.boolean().default(true),
        includeTeams: z.boolean().default(true),
        maxEntities: z.number().int().min(1).max(60).default(30),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ year, eventQuery, session, includeDrivers, includeTeams, maxEntities }): Promise<CallToolResult> => {
      try {
        const sources: Source[] = [];
        const out: Array<{
          kind: 'driver' | 'team' | 'org';
          label: string;
          handle?: string;
          url?: string;
          sourceUrl?: string;
        }> = [];

        for (const a of officialOrgAccounts) out.push({ kind: 'org', label: a.label, handle: a.handle, url: a.url });

        let driverRows: Record<string, unknown>[] = [];
        let teamRows: Record<string, unknown>[] = [];

        if (includeDrivers) {
          const d = await getWorker().request<Record<string, unknown>>('list_drivers', {
            year,
            eventQuery,
            session,
            maxRows: 200,
          });
          driverRows = (d as { drivers?: Record<string, unknown>[] }).drivers ?? [];
        }

        if (includeTeams) {
          const t = await getWorker().request<Record<string, unknown>>('list_teams', {
            year,
            eventQuery,
            session,
            maxRows: 50,
          });
          teamRows = (t as { teams?: Record<string, unknown>[] }).teams ?? [];
        }

        const entities: Array<{ kind: 'driver' | 'team'; query: string; label: string }> = [];
        if (includeDrivers) {
          for (const r of driverRows) {
            const name = String(r.FullName ?? r.BroadcastName ?? r.LastName ?? '').trim();
            const abbr = String(r.Abbreviation ?? '').trim();
            const label = name || abbr;
            if (!label) continue;
            entities.push({ kind: 'driver', query: name || label, label });
          }
        }
        if (includeTeams) {
          for (const r of teamRows) {
            const name = String(r.TeamName ?? r.TeamId ?? '').trim();
            if (!name) continue;
            entities.push({ kind: 'team', query: name, label: name });
          }
        }

        const unique = new Map<string, { kind: 'driver' | 'team'; query: string; label: string }>();
        for (const e of entities) unique.set(`${e.kind}:${normalize(e.label)}`, e);
        const list = [...unique.values()].slice(0, maxEntities);

        for (const batch of chunks(list, 5)) {
          const resolved = await Promise.all(
            batch.map(async e => {
              const cands = await wikidataSearchTwitterHandles(`${e.query}`, 3);
              const best = cands[0];
              return { e, best, candidates: cands };
            })
          );
          for (const r of resolved) {
            if (r.best) {
              out.push({
                kind: r.e.kind,
                label: r.e.label,
                handle: r.best.handle,
                url: r.best.xUrl,
                sourceUrl: r.best.itemUrl,
              });
              sources.push({ title: `Wikidata: ${r.best.label}`, url: r.best.itemUrl });
            } else {
              out.push({ kind: r.e.kind, label: r.e.label });
            }
          }
        }

        return ok(`Resolved X accounts for ${year} "${eventQuery}" ${session}.`, {
          year,
          eventQuery,
          session,
          accounts: out,
          sources,
        });
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

