import type { CallToolResult } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { FastF1WorkerClient } from '../../fastf1/workerClient.js';

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

function norm(s: unknown) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function scoreContains(hay: string, needle: string) {
  if (!hay || !needle) return 0;
  if (hay === needle) return 3;
  if (hay.includes(needle)) return 2;
  if (needle.includes(hay)) return 1;
  return 0;
}

function pickBest<T extends Record<string, unknown>>(rows: T[], query: string, keys: (keyof T)[]) {
  const q = norm(query);
  let best: { row: T; score: number } | undefined;
  for (const row of rows) {
    let score = 0;
    for (const k of keys) score = Math.max(score, scoreContains(norm(row[k]), q));
    if (!best || score > best.score) best = { row, score };
  }
  if (!best || best.score <= 0) return undefined;
  const ties = rows.filter(r => keys.some(k => scoreContains(norm(r[k]), q) === best.score));
  if (ties.length > 1) return { matchType: 'ambiguous' as const, candidates: ties.slice(0, 5) };
  return { matchType: 'unique' as const, row: best.row };
}

function profileMarkdown(title: string, fields: Record<string, unknown>) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `- ${k}: ${String(v)}`);
  return `# ${title}\n\n${lines.join('\n')}\n`;
}

export function registerFastF1Tools(server: McpServer) {
  server.registerTool(
    'f1_resolve_event',
    {
      title: 'Resolve F1 Event',
      description: 'Resolve a flexible event query (event name, location, country) into a canonical FastF1 EventName.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        query: z.string().min(1),
        prefer: z.enum(['event', 'location', 'country']).optional(),
        maxCandidates: z.number().int().min(1).max(20).default(5),
      }),
    },
    async ({ year, query, prefer, maxCandidates }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('resolve_event', {
          year,
          query,
          prefer,
          maxCandidates,
        });
        return ok(`Resolved query "${query}" for ${year}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_list_events',
    {
      title: 'List F1 Events',
      description: 'List events for a season (from the FastF1 event schedule).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        includeTesting: z.boolean().default(false),
        maxRows: z.number().int().min(1).max(500).default(50),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, includeTesting, maxRows }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('list_events', {
          year,
          includeTesting,
          maxRows,
        });
        return ok(`Listed events for ${year}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_session_results',
    {
      title: 'Get Session Results',
      description: 'Get results/classification for a session (R, Q, FP1, FP2, FP3, S, SQ).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1),
        maxRows: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, maxRows }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('get_session_results', {
          year,
          eventQuery,
          session,
          maxRows,
        });
        return ok(`Loaded results for ${year} "${eventQuery}" ${session}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_laps',
    {
      title: 'Get Laps',
      description: 'Get lap-by-lap data for a session. Use driver to filter and maxRows to limit output.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1),
        driver: z.string().min(1).optional(),
        maxRows: z.number().int().min(1).max(20000).default(2000),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, driver, maxRows }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('get_laps', {
          year,
          eventQuery,
          session,
          driver,
          maxRows,
        });
        return ok(`Loaded laps for ${year} "${eventQuery}" ${session}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_telemetry',
    {
      title: 'Get Telemetry',
      description:
        'Get telemetry for a driver and lap number. Use sampleStep and maxRows to control output size.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1),
        driver: z.string().min(1),
        lapNumber: z.number().int().min(1),
        sampleStep: z.number().int().min(1).max(100).default(5),
        maxRows: z.number().int().min(1).max(50000).default(5000),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, driver, lapNumber, sampleStep, maxRows }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('get_telemetry', {
          year,
          eventQuery,
          session,
          driver,
          lapNumber,
          sampleStep,
          maxRows,
        });
        return ok(`Loaded telemetry for ${driver} lap ${lapNumber}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_event_schedule_details',
    {
      title: 'Get Event Schedule Details',
      description: 'Get the event schedule row for an event (location, country, official name, session names and times).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        query: z.string().min(1),
        includeTesting: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, query, includeTesting }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('get_event_schedule_details', {
          year,
          query,
          includeTesting,
        });
        return ok(`Loaded event schedule details for ${year} "${query}".`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_list_drivers',
    {
      title: 'List Drivers',
      description:
        'List drivers (from session results). Provide eventQuery+session to target a specific event; otherwise uses the first event of the season.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1).optional(),
        session: z.string().min(1).default('R'),
        maxRows: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, maxRows }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('list_drivers', {
          year,
          eventQuery,
          session,
          maxRows,
        });
        return ok(`Listed drivers for ${year}${eventQuery ? ` "${eventQuery}"` : ''} ${session}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_list_teams',
    {
      title: 'List Teams',
      description:
        'List teams (from session results). Provide eventQuery+session to target a specific event; otherwise uses the first event of the season.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1).optional(),
        session: z.string().min(1).default('R'),
        maxRows: z.number().int().min(1).max(50).default(50),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, maxRows }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('list_teams', {
          year,
          eventQuery,
          session,
          maxRows,
        });
        return ok(`Listed teams for ${year}${eventQuery ? ` "${eventQuery}"` : ''} ${session}.`, result);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_driver_profile',
    {
      title: 'Get Driver Profile',
      description:
        'Get a driver profile from real session results (name, abbreviation, number, team, headshot URL when available).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1).default('R'),
        driver: z.string().min(1),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, driver }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('list_drivers', {
          year,
          eventQuery,
          session,
          maxRows: 200,
        });
        const drivers = (result as { drivers?: Record<string, unknown>[] }).drivers ?? [];
        const picked = pickBest(drivers, driver, [
          'Abbreviation',
          'DriverNumber',
          'FullName',
          'LastName',
          'FirstName',
          'BroadcastName',
          'DriverId',
        ]);

        if (!picked) return toolError(`Driver not found: ${driver}`);
        if (picked.matchType === 'ambiguous') return ok(`Driver match is ambiguous for "${driver}".`, picked);

        const row = picked.row;
        const title = `${row.FullName ?? row.BroadcastName ?? row.Abbreviation ?? row.DriverNumber ?? 'Driver'}`;
        const md = profileMarkdown(title, {
          DriverNumber: row.DriverNumber,
          Abbreviation: row.Abbreviation,
          FullName: row.FullName,
          BroadcastName: row.BroadcastName,
          DriverId: row.DriverId,
          TeamName: row.TeamName,
          TeamId: row.TeamId,
          TeamColor: row.TeamColor,
          HeadshotUrl: row.HeadshotUrl,
          CountryCode: row.CountryCode,
        });

        return {
          content: [{ type: 'text', text: md }],
          structuredContent: { event: (result as { event?: unknown }).event, session, driver: row },
        };
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_get_team_profile',
    {
      title: 'Get Team Profile',
      description: 'Get a team profile from real session results (name/id/color and drivers present in that session).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1).default('R'),
        team: z.string().min(1),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, team }): Promise<CallToolResult> => {
      try {
        const teamsRes = await getWorker().request<Record<string, unknown>>('list_teams', {
          year,
          eventQuery,
          session,
          maxRows: 50,
        });
        const teams = (teamsRes as { teams?: Record<string, unknown>[] }).teams ?? [];
        const pickedTeam = pickBest(teams, team, ['TeamName', 'TeamId']);
        if (!pickedTeam) return toolError(`Team not found: ${team}`);
        if (pickedTeam.matchType === 'ambiguous') return ok(`Team match is ambiguous for "${team}".`, pickedTeam);

        const teamRow = pickedTeam.row;
        const driversRes = await getWorker().request<Record<string, unknown>>('list_drivers', {
          year,
          eventQuery,
          session,
          maxRows: 200,
        });
        const drivers = (driversRes as { drivers?: Record<string, unknown>[] }).drivers ?? [];
        const teamId = norm(teamRow.TeamId);
        const teamName = norm(teamRow.TeamName);
        const teamDrivers = drivers.filter(d => norm(d.TeamId) === teamId || norm(d.TeamName) === teamName);

        const md = profileMarkdown(String(teamRow.TeamName ?? teamRow.TeamId ?? 'Team'), {
          TeamName: teamRow.TeamName,
          TeamId: teamRow.TeamId,
          TeamColor: teamRow.TeamColor,
          Drivers: teamDrivers.map(d => d.Abbreviation ?? d.FullName ?? d.DriverNumber).filter(Boolean).join(', '),
        });

        return {
          content: [{ type: 'text', text: md }],
          structuredContent: {
            event: (teamsRes as { event?: unknown }).event,
            session,
            team: teamRow,
            drivers: teamDrivers,
          },
        };
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_chart_session_results',
    {
      title: 'Chart Session Results',
      description: 'Generate a PNG chart for a session result table (points or position).',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1),
        metric: z.enum(['points', 'position']).default('points'),
        topN: z.number().int().min(1).max(30).default(10),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, metric, topN }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('chart_session_results', {
          year,
          eventQuery,
          session,
          metric,
          topN,
        });

        const { data, mimeType, ...meta } = result as { data?: string; mimeType?: string } & Record<string, unknown>;
        if (!data || !mimeType) return toolError('Worker returned no image data');

        return {
          content: [
            { type: 'text', text: `Generated session results chart for ${year} "${eventQuery}" ${session}.` },
            { type: 'image', data, mimeType },
          ],
          structuredContent: meta,
        };
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'f1_chart_lap_times',
    {
      title: 'Chart Lap Times',
      description: 'Generate a PNG line chart of lap time (seconds) vs lap number for a driver.',
      inputSchema: z.object({
        year: z.number().int().min(1950),
        eventQuery: z.string().min(1),
        session: z.string().min(1),
        driver: z.string().min(1),
        maxLaps: z.number().int().min(1).max(200).default(70),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ year, eventQuery, session, driver, maxLaps }): Promise<CallToolResult> => {
      try {
        const result = await getWorker().request<Record<string, unknown>>('chart_lap_times', {
          year,
          eventQuery,
          session,
          driver,
          maxLaps,
        });

        const { data, mimeType, ...meta } = result as { data?: string; mimeType?: string } & Record<string, unknown>;
        if (!data || !mimeType) return toolError('Worker returned no image data');

        return {
          content: [
            { type: 'text', text: `Generated lap time chart for ${year} "${eventQuery}" ${session} driver ${driver}.` },
            { type: 'image', data, mimeType },
          ],
          structuredContent: meta,
        };
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
