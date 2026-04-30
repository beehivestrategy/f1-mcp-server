import type { CallToolResult, ContentBlock } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { FastF1WorkerClient } from '../../fastf1/workerClient.js';
import { searchWiki } from '../wiki.js';

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

function toolError(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function uniqBy<T>(arr: T[], key: (v: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of arr) {
    const k = key(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

const TopicSchema = z.enum([
  'general',
  'safety-car',
  'track-limits',
  'overtaking',
  'pit-lane',
  'flags',
  'drs',
  'blue-flags',
  'classification',
  'penalties',
]);

function topicKeywords(topic: z.infer<typeof TopicSchema>) {
  switch (topic) {
    case 'safety-car':
      return ['Safety Car', 'Virtual Safety Car', 'VSC', 'resumption', 'restart'];
    case 'track-limits':
      return ['track limits', 'leaving the track', 'advantage'];
    case 'overtaking':
      return ['overtaking', 'driving standards', 'forcing', 'advantage'];
    case 'pit-lane':
      return ['pit lane', 'pit entry', 'pit exit', 'unsafe release'];
    case 'flags':
      return ['yellow', 'red flag', 'suspension', 'resumption'];
    case 'drs':
      return ['DRS', 'drag reduction', 'activation'];
    case 'blue-flags':
      return ['blue flag', 'lapping', 'unlapping'];
    case 'classification':
      return ['classification', 'points'];
    case 'penalties':
      return ['penalty', 'incident', 'stewards'];
    case 'general':
    default:
      return ['classification', 'penalty'];
  }
}

export function registerEvidencePackTools(server: McpServer) {
  server.registerTool(
    'f1_build_evidence_pack',
    {
      title: 'Build Evidence Pack',
      description:
        'Build a single evidence pack for analysis by combining FastF1 data, FIA regulation snippets (with page numbers), and relevant wiki guidance. Returns real data only.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1).default('R'),
        topic: TopicSchema.default('general'),
        includeResults: z.boolean().default(true),
        includeLaps: z.boolean().default(false),
        includeCharts: z.boolean().default(true),
        chartTopN: z.number().int().min(1).max(30).default(10),
        drivers: z.array(z.string().min(1)).optional(),
        lapsMaxRows: z.number().int().min(1).max(20000).default(1500),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({
      year,
      eventQuery,
      session,
      topic,
      includeResults,
      includeLaps,
      includeCharts,
      chartTopN,
      drivers,
      lapsMaxRows,
    }): Promise<CallToolResult> => {
      try {
        const sources: Source[] = [];

        const resolved = await getWorker().request<Record<string, unknown>>('resolve_event', {
          year,
          query: eventQuery,
          maxCandidates: 5,
        });
        if ((resolved as { matchType?: string }).matchType !== 'unique') {
          return toolError(`Event is ambiguous. Use f1_resolve_event first. ${JSON.stringify(resolved)}`);
        }

        const event = (resolved as { event?: Record<string, unknown> }).event ?? {};

        const wikiMatches = uniqBy(searchWiki(topic, 8), m => m.uri);

        const keywordList = topicKeywords(topic);
        const regQueries = uniqBy(keywordList, s => s.toLowerCase());
        const regResults: unknown[] = [];
        for (const q of regQueries) {
          const r = await getWorker().request<Record<string, unknown>>('fia_search_regulations', {
            year: 2026,
            query: q,
            sections: ['B'],
            maxResults: 3,
            maxChars: 900,
          });
          const items = (r as { results?: unknown[] }).results ?? [];
          for (const it of items) {
            regResults.push(it);
            const url = (it as { url?: string }).url;
            const title = (it as { title?: string }).title;
            if (url && title) sources.push({ title, url });
          }
        }

        const structured: Record<string, unknown> = {
          topic,
          event,
          session,
          wiki: wikiMatches,
          fia: { keywords: regQueries, matches: regResults },
          sources: uniqBy(sources, s => s.url),
        };

        const content: ContentBlock[] = [
          {
            type: 'text',
            text: `Evidence pack: ${year} "${String(event.eventName ?? eventQuery)}" ${session} (${topic}).`,
          },
        ];

        if (includeResults) {
          const results = await getWorker().request<Record<string, unknown>>('get_session_results', {
            year,
            eventQuery,
            session,
            maxRows: 60,
          });
          structured.results = results;
        }

        if (includeLaps) {
          if (drivers && drivers.length) {
            const perDriver = [];
            for (const d of drivers.slice(0, 3)) {
              const laps = await getWorker().request<Record<string, unknown>>('get_laps', {
                year,
                eventQuery,
                session,
                driver: d,
                maxRows: lapsMaxRows,
              });
              perDriver.push({ driver: d, laps });
            }
            structured.laps = { mode: 'perDriver', items: perDriver };
          } else {
            const laps = await getWorker().request<Record<string, unknown>>('get_laps', {
              year,
              eventQuery,
              session,
              maxRows: lapsMaxRows,
            });
            structured.laps = { mode: 'all', laps };
          }
        }

        if (includeCharts) {
          const chart = await getWorker().request<Record<string, unknown>>('chart_session_results', {
            year,
            eventQuery,
            session,
            metric: 'points',
            topN: chartTopN,
          });
          const data = (chart as { data?: string }).data;
          const mimeType = (chart as { mimeType?: string }).mimeType;
          if (data && mimeType) {
            content.push({ type: 'image', data, mimeType });
            structured.chart = { type: 'session_results_points', year, eventQuery, session, topN: chartTopN };
          }
        }

        return { content, structuredContent: structured };
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

